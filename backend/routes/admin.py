import os
import json
import time
from io import BytesIO
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify, send_file
from sqlalchemy import text
from sqlalchemy.orm import aliased
from models import db, User, Product, Location, Category, Inventory
from models import StockTransfer, StockAdjustment, ActivityLog, Order, OrderItem, Payment
from models import PasswordResetToken, PasswordResetRequest, StockRequest, StoreReport, ManualSection, ProductVariety
from utils.sorting import quick_sort
from utils.activity_logger import log_activity
from utils.backup_storage import (
    create_backup as storage_create_backup,
    list_backups as storage_list_backups,
    download_backup_json as storage_download_json,
    delete_backup as storage_delete_backup,
    backup_count as storage_backup_count,
)
from config import IS_PRODUCTION

admin_bp = Blueprint("admin", __name__)

BACKUP_MODELS = [
    ("Users", User), ("Locations", Location), ("Categories", Category),
    ("Products", Product), ("Orders", Order), ("Order Items", OrderItem),
    ("Payments", Payment), ("Inventory", Inventory),
    ("Stock Transfers", StockTransfer), ("Stock Adjustments", StockAdjustment),
    ("Activity Logs", ActivityLog),
    ("Password Reset Tokens", PasswordResetToken),
    ("Password Reset Requests", PasswordResetRequest),
    ("Stock Requests", StockRequest),
    ("Store Reports", StoreReport),
    ("Manual Sections", ManualSection),
    ("Product Varieties", ProductVariety),
]

# (child_table, child_fk_column, parent_table, parent_pk_column, is_nullable)
FK_RELATIONSHIPS = [
    ("PasswordResetTokens", "user_id", "Users", "user_id", False),
    ("Products", "category_id", "Categories", "category_id", False),
    ("Orders", "location_id", "Locations", "location_id", False),
    ("OrderItems", "order_id", "Orders", "order_id", False),
    ("OrderItems", "product_id", "Products", "product_id", False),
    ("Payments", "order_id", "Orders", "order_id", False),
    ("Inventory", "product_id", "Products", "product_id", False),
    ("Inventory", "location_id", "Locations", "location_id", False),
    ("StockTransfers", "product_id", "Products", "product_id", False),
    ("StockTransfers", "from_location_id", "Locations", "location_id", False),
    ("StockTransfers", "to_location_id", "Locations", "location_id", False),
    ("StockTransfers", "user_id", "Users", "user_id", False),
    ("StockAdjustments", "product_id", "Products", "product_id", False),
    ("StockAdjustments", "location_id", "Locations", "location_id", False),
    ("StockAdjustments", "user_id", "Users", "user_id", False),
    ("ActivityLogs", "user_id", "Users", "user_id", False),
    ("StockRequests", "product_id", "Products", "product_id", False),
    ("StockRequests", "from_location_id", "Locations", "location_id", False),
    ("StockRequests", "to_location_id", "Locations", "location_id", False),
    ("StockRequests", "requested_by", "Users", "user_id", False),
    ("StoreReports", "user_id", "Users", "user_id", False),
    ("StoreReports", "location_id", "Locations", "location_id", False),
    ("StoreReports", "resolved_by", "Users", "user_id", True),
    ("ManualSections", "parent_id", "ManualSections", "section_id", True),
    ("ProductVarieties", "product_id", "Products", "product_id", False),
    ("Inventory", "variety_id", "ProductVarieties", "variety_id", True),
    ("OrderItems", "variety_id", "ProductVarieties", "variety_id", True),
    ("StockTransfers", "variety_id", "ProductVarieties", "variety_id", True),
    ("StockAdjustments", "variety_id", "ProductVarieties", "variety_id", True),
    ("StockRequests", "variety_id", "ProductVarieties", "variety_id", True),
]


def _authorized(usertype):
    return usertype in [1, 3]


def _format_size(size_bytes):
    for unit in ["B", "KB", "MB", "GB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} TB"


def _table_counts():
    return {name: db.session.query(m).count() for name, m in BACKUP_MODELS}


def _serialise_row(row):
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, datetime):
            val = val.isoformat()
        d[col.name] = val
    return d


def _resolve(name):
    for n, m in BACKUP_MODELS:
        if n == name:
            return m
    return None


# ── BACKUP & RESTORE ──

@admin_bp.route("/api/admin/backups", methods=["GET"])
def list_backups():
    usertype = request.args.get("usertype", type=int)
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        sort_by = request.args.get("sort_by", "created_at")
        sort_order = request.args.get("sort_order", "desc")
        files = storage_list_backups()
        files = quick_sort(files, key=sort_by, order=sort_order)
        return jsonify({"success": True, "data": files})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/admin/backups", methods=["POST"])
def create_backup():
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        backup_data = {}
        for name, model in BACKUP_MODELS:
            rows = model.query.all()
            backup_data[name] = [_serialise_row(r) for r in rows]

        result = storage_create_backup(backup_data)
        return jsonify({
            "success": True,
            "message": f"Backup created ({len(json.dumps(backup_data))} bytes)",
            "data": result,
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/admin/backups/<filename>/restore", methods=["POST"])
def restore_backup(filename):
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        if ".." in filename or "/" in filename:
            return jsonify({"success": False, "error": "Invalid filename"}), 400

        backup_data = storage_download_json(filename)

        for name, model in reversed(BACKUP_MODELS):
            db.session.query(model).delete()
        db.session.commit()

        for name, model in BACKUP_MODELS:
            rows = backup_data.get(name, [])
            if name == "Manual Sections":
                rows = sorted(rows, key=lambda r: r.get("section_id", 0))
            for row_data in rows:
                for col in ("created_at", "updated_at", "order_date", "transfer_date",
                            "date", "timestamp"):
                    if col in row_data and isinstance(row_data[col], str):
                        try:
                            row_data[col] = datetime.fromisoformat(row_data[col].replace("Z", "+00:00"))
                        except (ValueError, TypeError):
                            pass
                instance = model(**row_data)
                db.session.add(instance)
        db.session.commit()

        return jsonify({"success": True, "message": "Database restored successfully"})
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/admin/backups/<filename>", methods=["DELETE"])
def delete_backup(filename):
    usertype = request.args.get("usertype", type=int)
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        if ".." in filename or "/" in filename:
            return jsonify({"success": False, "error": "Invalid filename"}), 400
        storage_delete_backup(filename)
        return jsonify({"success": True, "message": "Backup deleted"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/admin/backups/<filename>/download", methods=["GET"])
def download_backup(filename):
    usertype = request.args.get("usertype", type=int)
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    if ".." in filename or "/" in filename:
        return jsonify({"success": False, "error": "Invalid filename"}), 400
    try:
        raw = storage_download_json(filename)
        content = json.dumps(raw, indent=2).encode("utf-8")
        return send_file(
            BytesIO(content),
            mimetype="application/json",
            as_attachment=True,
            download_name=filename,
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── SYSTEM INFO ──

@admin_bp.route("/api/admin/system/info", methods=["GET"])
def system_info():
    usertype = request.args.get("usertype", type=int)
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        is_pg = db.engine.url.drivername == "postgresql"

        if is_pg:
            result = db.session.execute(text("SELECT version()"))
            db_version = result.scalar()
            result = db.session.execute(text("SELECT pg_database_size(current_database())"))
            db_bytes = result.scalar()
        else:
            db_version = "SQLite (local mode)"
            _db_file = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                "..", "db", "database.db"
            )
            db_bytes = os.path.getsize(_db_file) if os.path.exists(_db_file) else 0

        counts = _table_counts()
        sort_by = request.args.get("sort_by", "name")
        sort_order = request.args.get("sort_order", "asc")
        counts_list = [{"name": k, "count": v} for k, v in counts.items()]
        counts_list = quick_sort(counts_list, key=sort_by, order=sort_order)

        return jsonify({
            "success": True,
            "data": {
                "app_name": "MCM Trading System",
                "version": "0.0.1",
                "db_version": db_version,
                "database_size": db_bytes,
                "database_size_formatted": _format_size(db_bytes),
                "backup_count": storage_backup_count(),
                "table_counts": counts_list,
            }
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── MAINTENANCE ──

@admin_bp.route("/api/admin/maintenance/check", methods=["POST"])
def integrity_check():
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        issues = []
        tables = []
        for name, model in BACKUP_MODELS:
            try:
                count = db.session.query(model).count()
                tables.append({"name": name, "count": count, "ok": True})
            except Exception as e:
                issues.append({"type": "table_error", "table": name, "detail": str(e)})
                tables.append({"name": name, "count": 0, "ok": False})

        fk_violation_count = 0
        orphan_by_table = []
        for child_name, fk_col, parent_name, pk_col, nullable in FK_RELATIONSHIPS:
            child_model = _resolve(child_name)
            parent_model = _resolve(parent_name)
            if child_model is None or parent_model is None:
                continue
            parent_ref = aliased(parent_model) if child_model is parent_model else parent_model
            child_fk = getattr(child_model, fk_col)
            parent_pk = getattr(parent_ref, pk_col)
            q = db.session.query(child_model).outerjoin(
                parent_ref, child_fk == parent_pk
            ).filter(parent_pk.is_(None))
            if nullable:
                q = q.filter(child_fk.isnot(None))
            try:
                count = q.count()
            except Exception as e:
                issues.append({
                    "type": "fk_check_error",
                    "table": child_name,
                    "detail": f"{fk_col} -> {parent_name}: {e}",
                })
                continue
            fk_violation_count += count
            if count > 0:
                samples = []
                try:
                    sample_q = db.session.query(child_model).outerjoin(
                        parent_ref, child_fk == parent_pk
                    ).filter(parent_pk.is_(None))
                    if nullable:
                        sample_q = sample_q.filter(child_fk.isnot(None))
                    for row in sample_q.limit(50).all():
                        samples.append(_serialise_row(row))
                except Exception:
                    pass
                orphan_by_table.append({
                    "child_table": child_name,
                    "fk_column": fk_col,
                    "parent_table": parent_name,
                    "count": count,
                    "samples": samples,
                })

        neg_inventory_samples = []
        try:
            neg_rows = db.session.query(Inventory).filter(
                Inventory.quantity < 0
            ).limit(50).all()
            neg_inventory_count = len(neg_rows)
            if len(neg_rows) < 50:
                neg_inventory_count = db.session.query(Inventory).filter(
                    Inventory.quantity < 0
                ).count()
            for inv in neg_rows:
                d = _serialise_row(inv)
                try:
                    prod = Product.query.get(inv.product_id)
                    d["product_name"] = prod.name if prod else None
                except Exception:
                    d["product_name"] = None
                try:
                    loc = Location.query.get(inv.location_id)
                    d["location_name"] = loc.name if loc else None
                except Exception:
                    d["location_name"] = None
                neg_inventory_samples.append(d)
        except Exception as e:
            neg_inventory_count = 0
            neg_inventory_samples = []
            issues.append({"type": "inventory_check_error", "table": "Inventory", "detail": str(e)})

        stale_token_samples = []
        try:
            stale_token_cutoff = datetime.now() - timedelta(hours=24)
            stale_query = PasswordResetToken.query.filter(
                PasswordResetToken.used == False,
                PasswordResetToken.expires_at < stale_token_cutoff,
            )
            stale_rows = stale_query.limit(50).all()
            stale_token_count = len(stale_rows)
            if len(stale_rows) < 50:
                stale_token_count = stale_query.count()
            for t in stale_rows:
                d = _serialise_row(t)
                try:
                    u = User.query.get(t.user_id)
                    d["user_name"] = u.name if u else None
                    d["user_email"] = u.email if u else None
                except Exception:
                    d["user_name"] = None
                    d["user_email"] = None
                stale_token_samples.append(d)
        except Exception as e:
            stale_token_count = 0
            stale_token_samples = []
            issues.append({"type": "token_check_error", "table": "PasswordResetTokens", "detail": str(e)})

        checks = {
            "foreign_key_violations": {
                "ok": fk_violation_count == 0,
                "count": fk_violation_count,
            },
            "orphan_rows": {
                "ok": fk_violation_count == 0,
                "total": fk_violation_count,
                "by_table": orphan_by_table,
            },
            "negative_inventory": {
                "ok": neg_inventory_count == 0,
                "count": neg_inventory_count,
                "samples": neg_inventory_samples,
            },
            "stale_password_tokens": {
                "ok": stale_token_count == 0,
                "count": stale_token_count,
                "samples": stale_token_samples,
            },
        }

        passed = (
            fk_violation_count == 0
            and neg_inventory_count == 0
            and stale_token_count == 0
            and not issues
        )

        if passed:
            summary = f"All 4 checks passed; {len(tables)} tables scanned"
        else:
            parts = []
            if fk_violation_count:
                parts.append(f"{fk_violation_count} orphan row(s)")
            if neg_inventory_count:
                parts.append(f"{neg_inventory_count} negative inventory")
            if stale_token_count:
                parts.append(f"{stale_token_count} stale password token(s)")
            if issues:
                parts.append(f"{len(issues)} hard error(s)")
            summary = f"Issues found: {', '.join(parts) if parts else 'see details'}"

        response_data = {
            "integrity_check": "ok" if passed else "issues_found",
            "foreign_key_violations": fk_violation_count,
            "issues": issues,
            "passed": passed,
            "summary": summary,
            "ran_at": datetime.now().isoformat(),
            "checks": checks,
            "tables": tables,
        }

        user_id = data.get("user_id")
        if user_id:
            try:
                log_activity(
                    user_id=user_id,
                    module="maintenance",
                    action_type="integrity_check",
                    action="Ran database integrity check",
                    details={
                        "passed": passed,
                        "fk_violations": fk_violation_count,
                        "negative_inventory": neg_inventory_count,
                        "stale_tokens": stale_token_count,
                        "table_errors": len(issues),
                    },
                )
            except Exception:
                pass

        return jsonify({"success": True, "data": response_data})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── OPTIMIZE ──

@admin_bp.route("/api/admin/optimize/vacuum", methods=["POST"])
def run_vacuum():
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    if IS_PRODUCTION:
        return jsonify({"success": False, "error": "VACUUM is disabled in production"}), 400
    try:
        if db.engine.url.drivername != "postgresql":
            return jsonify({"success": False, "error": "VACUUM is only available in PostgreSQL mode"}), 400
        size_before = db.session.execute(
            text("SELECT pg_database_size(current_database())")
        ).scalar()
        start = time.time()
        db.session.execute(text("VACUUM ANALYZE"))
        db.session.commit()
        size_after = db.session.execute(
            text("SELECT pg_database_size(current_database())")
        ).scalar()
        elapsed = round(time.time() - start, 2)
        space_saved = max(0, (size_before or 0) - (size_after or 0))
        result = {
            "duration_seconds": elapsed,
            "size_before": size_before or 0,
            "size_after": size_after or 0,
            "size_before_formatted": _format_size(size_before or 0),
            "size_after_formatted": _format_size(size_after or 0),
            "space_saved": space_saved,
            "space_saved_formatted": _format_size(space_saved),
        }
        user_id = data.get("user_id")
        if user_id:
            try:
                log_activity(
                    user_id=user_id,
                    module="maintenance",
                    action_type="optimize",
                    action="Ran VACUUM ANALYZE",
                    details={"space_saved": space_saved, "duration_seconds": elapsed},
                )
            except Exception:
                pass
        return jsonify({
            "success": True,
            "message": "VACUUM ANALYZE completed",
            "data": result
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/admin/optimize/reindex", methods=["POST"])
def run_reindex():
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    if IS_PRODUCTION:
        return jsonify({"success": False, "error": "REINDEX is disabled in production"}), 400
    try:
        if db.engine.url.drivername != "postgresql":
            return jsonify({"success": False, "error": "REINDEX is only available in PostgreSQL mode"}), 400
        start = time.time()
        db.session.execute(text("REINDEX SCHEMA public"))
        db.session.commit()
        elapsed = round(time.time() - start, 2)
        user_id = data.get("user_id")
        if user_id:
            try:
                log_activity(
                    user_id=user_id,
                    module="maintenance",
                    action_type="optimize",
                    action="Ran REINDEX",
                    details={"duration_seconds": elapsed},
                )
            except Exception:
                pass
        return jsonify({
            "success": True,
            "message": "Indexes rebuilt successfully",
            "data": {"duration_seconds": elapsed}
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ── CLEANUP ──

@admin_bp.route("/api/admin/cleanup/logs", methods=["POST"])
def cleanup_logs():
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        days = data.get("days", 90)
        cutoff = datetime.now() - timedelta(days=days)
        deleted = ActivityLog.query.filter(ActivityLog.timestamp < cutoff).delete()
        db.session.commit()
        return jsonify({
            "success": True,
            "message": f"Deleted {deleted} activity log(s) older than {days} days",
            "data": {"deleted_count": deleted, "retention_days": days}
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/admin/cleanup/products", methods=["POST"])
def cleanup_products():
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        voided = Product.query.filter_by(is_active=False).all()
        count = len(voided)
        for p in voided:
            Inventory.query.filter_by(product_id=p.product_id).delete()
            StockTransfer.query.filter_by(product_id=p.product_id).delete()
            StockAdjustment.query.filter_by(product_id=p.product_id).delete()
            db.session.delete(p)
        db.session.commit()
        return jsonify({
            "success": True,
            "message": f"Permanently deleted {count} voided product(s)",
            "data": {"deleted_count": count}
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/admin/cleanup/transfers", methods=["POST"])
def cleanup_transfers():
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        days = data.get("days", 90)
        cutoff = datetime.now() - timedelta(days=days)
        deleted = StockTransfer.query.filter(
            StockTransfer.transfer_date < cutoff,
            StockTransfer.status.in_(["cancelled", "completed"])
        ).delete()
        db.session.commit()
        return jsonify({
            "success": True,
            "message": f"Deleted {deleted} transfer(s) older than {days} days",
            "data": {"deleted_count": deleted, "retention_days": days}
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/admin/cleanup/all", methods=["POST"])
def cleanup_all():
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        days = data.get("days", 90)
        cutoff = datetime.now() - timedelta(days=days)

        logs_deleted = ActivityLog.query.filter(ActivityLog.timestamp < cutoff).delete()

        voided = Product.query.filter_by(is_active=False).all()
        products_deleted = len(voided)
        for p in voided:
            Inventory.query.filter_by(product_id=p.product_id).delete()
            StockTransfer.query.filter_by(product_id=p.product_id).delete()
            StockAdjustment.query.filter_by(product_id=p.product_id).delete()
            db.session.delete(p)

        transfers_deleted = StockTransfer.query.filter(
            StockTransfer.transfer_date < cutoff,
            StockTransfer.status.in_(["cancelled", "completed"])
        ).delete()

        db.session.commit()
        return jsonify({
            "success": True,
            "message": "Cleanup completed",
            "data": {
                "logs_deleted": logs_deleted,
                "products_deleted": products_deleted,
                "transfers_deleted": transfers_deleted,
                "retention_days": days,
            }
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


# ── FIX ──

@admin_bp.route("/api/admin/maintenance/fix/orphans", methods=["POST"])
def fix_orphans():
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        total_deleted = 0
        for child_name, fk_col, parent_name, pk_col, nullable in FK_RELATIONSHIPS:
            child_model = _resolve(child_name)
            parent_model = _resolve(parent_name)
            if child_model is None or parent_model is None:
                continue
            parent_ref = aliased(parent_model) if child_model is parent_model else parent_model
            child_fk = getattr(child_model, fk_col)
            parent_pk = getattr(parent_ref, pk_col)
            subq = db.session.query(child_model).outerjoin(
                parent_ref, child_fk == parent_pk
            ).filter(parent_pk.is_(None))
            if nullable:
                subq = subq.filter(child_fk.isnot(None))
            pk_col_name = next(iter(child_model.__table__.primary_key.columns)).name
            orphan_ids = [getattr(r, pk_col_name) for r in subq.all()]
            if orphan_ids:
                db.session.query(child_model).filter(
                    getattr(child_model, pk_col_name).in_(orphan_ids)
                ).delete(synchronize_session='fetch')
                total_deleted += len(orphan_ids)
        db.session.commit()
        user_id = data.get("user_id")
        if user_id:
            try:
                log_activity(
                    user_id=user_id,
                    module="maintenance",
                    action_type="fix",
                    action="Deleted orphan rows",
                    details={"deleted_count": total_deleted},
                )
            except Exception:
                pass
        return jsonify({
            "success": True,
            "message": f"Deleted {total_deleted} orphan row(s)",
            "data": {"deleted_count": total_deleted},
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/admin/maintenance/fix/negative-inventory", methods=["POST"])
def fix_negative_inventory():
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        target = data.get("target", 0)
        if not isinstance(target, (int, float)):
            return jsonify({"success": False, "error": "Invalid target value"}), 400
        affected = db.session.query(Inventory).filter(
            Inventory.quantity < 0
        ).count()
        db.session.query(Inventory).filter(
            Inventory.quantity < 0
        ).update({"quantity": target}, synchronize_session='fetch')
        db.session.commit()
        user_id = data.get("user_id")
        if user_id:
            try:
                log_activity(
                    user_id=user_id,
                    module="maintenance",
                    action_type="fix",
                    action="Reset negative inventory",
                    details={"affected_count": affected, "target": target},
                )
            except Exception:
                pass
        return jsonify({
            "success": True,
            "message": f"Reset {affected} inventory row(s) to {target}",
            "data": {"affected_count": affected, "target": target},
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500


@admin_bp.route("/api/admin/maintenance/fix/stale-tokens", methods=["POST"])
def fix_stale_tokens():
    data = request.get_json() or {}
    usertype = data.get("usertype")
    if not _authorized(usertype):
        return jsonify({"success": False, "error": "Unauthorized"}), 403
    try:
        stale_cutoff = datetime.now() - timedelta(hours=24)
        deleted = PasswordResetToken.query.filter(
            PasswordResetToken.used == False,
            PasswordResetToken.expires_at < stale_cutoff,
        ).delete()
        db.session.commit()
        user_id = data.get("user_id")
        if user_id:
            try:
                log_activity(
                    user_id=user_id,
                    module="maintenance",
                    action_type="fix",
                    action="Deleted stale password tokens",
                    details={"deleted_count": deleted},
                )
            except Exception:
                pass
        return jsonify({
            "success": True,
            "message": f"Deleted {deleted} stale password token(s)",
            "data": {"deleted_count": deleted},
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500
