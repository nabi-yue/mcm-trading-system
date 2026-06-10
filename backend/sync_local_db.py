"""Sync remote PostgreSQL data to local SQLite for offline demo mode.

Usage:
    python backend/sync_local_db.py

Then set DB_MODE=local in .env and run the app normally.
"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

os.environ["DB_MODE"] = "remote"

from flask import Flask
from app import create_app
from models import db
from models import (
    User, Location, Category, Product, Order, OrderItem,
    Payment, Inventory, StockTransfer, StockAdjustment, ActivityLog,
    PasswordResetToken, PasswordResetRequest, StoreReport, StockRequest, Notification, ManualSection,
)

ALL_MODELS = [
    Location, User, Category, Product,
    Order, OrderItem, Payment, Inventory,
    StockTransfer, StockAdjustment, ActivityLog,
    PasswordResetToken, PasswordResetRequest, StoreReport,
    StockRequest, Notification, ManualSection,
]

DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "db", "database.db",
)


def _serialize(row):
    d = {}
    for col in row.__table__.columns:
        val = getattr(row, col.name)
        if isinstance(val, datetime):
            val = val.isoformat()
        d[col.name] = val
    return d


def _deserialize(row_data):
    for col in ("created_at", "updated_at", "order_date", "transfer_date",
                "date", "timestamp", "expires_at", "resolved_at"):
        if col in row_data and isinstance(row_data[col], str):
            try:
                row_data[col] = datetime.fromisoformat(row_data[col].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
    return row_data


def sync():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    print(f"Local DB: {DB_PATH}")

    app = create_app()

    with app.app_context():
        print(f"Connected to: {db.engine.url.drivername}")
        if db.engine.url.drivername != "postgresql":
            print("ERROR: DATABASE_URL is not PostgreSQL. Check .env.")
            sys.exit(1)

        data = {}
        for model in ALL_MODELS:
            rows = model.query.all()
            data[model.__tablename__] = [_serialize(r) for r in rows]
            print(f"  Read {model.__tablename__}: {len(rows)} rows")

    local_uri = f"sqlite:///{DB_PATH}"
    local_app = Flask("local_sync")
    local_app.config["SQLALCHEMY_DATABASE_URI"] = local_uri
    local_app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    local_app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {}
    db.init_app(local_app)

    with local_app.app_context():
        db.session.close()
        db.drop_all()
        db.create_all()

        from sqlalchemy import text as _text
        if db.engine.url.drivername == "sqlite":
            db.session.execute(_text("PRAGMA foreign_keys = OFF"))

        for model in ALL_MODELS:
            rows = data.get(model.__tablename__, [])
            for r in rows:
                db.session.add(model(**_deserialize(r)))
            db.session.commit()
            print(f"  Wrote {model.__tablename__}: {len(rows)} rows")

        if db.engine.url.drivername == "sqlite":
            db.session.execute(_text("PRAGMA foreign_keys = ON"))
        db.session.commit()

    print("\nDone! Set DB_MODE=local in .env and run the app.")
    size = os.path.getsize(DB_PATH)
    for unit in ["B", "KB", "MB"]:
        if size < 1024:
            print(f"File size: {size:.1f} {unit}")
            break
        size /= 1024


if __name__ == "__main__":
    sync()
