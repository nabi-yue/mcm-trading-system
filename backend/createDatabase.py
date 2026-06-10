import os
import sys
import random
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from models import db, User, Location, Category, Product, Order, OrderItem
from models import Payment, Inventory, StockTransfer, StockAdjustment, ActivityLog, ManualSection
from models import StockRequest, StoreReport, Notification, ProductVariety
from werkzeug.security import generate_password_hash

# ── Configuration ──
DB_MODE = os.environ.get("DB_MODE", "local")
FORCE = os.environ.get("SEED_FORCE", "").lower() in ("1", "true", "yes") or "--force" in sys.argv
IF_EMPTY = "--if-empty" in sys.argv

SEED_ORDERS = int(os.environ.get("SEED_ORDERS", "500"))
SEED_TRANSFERS = int(os.environ.get("SEED_TRANSFERS", "100"))
SEED_ADJUSTMENTS = int(os.environ.get("SEED_ADJUSTMENTS", "75"))
SEED_ACTIVITY_LOGS = int(os.environ.get("SEED_ACTIVITY_LOGS", "500"))
SEED_STOCK_REQUESTS = int(os.environ.get("SEED_STOCK_REQUESTS", "15"))
SEED_STORE_REPORTS = int(os.environ.get("SEED_STORE_REPORTS", "20"))

LOCATION_NAMES = ["Storehouse", "Branch 1", "Branch 2"]


def _auto_sku(existing_products):
    max_num = 0
    for p in existing_products:
        if p.sku and p.sku.startswith("PROD-"):
            try:
                num = int(p.sku.replace("PROD-", ""))
                max_num = max(max_num, num)
            except ValueError:
                pass
    return max_num


def seed(skip_drop=False):
    app = create_app()
    with app.app_context():
        if not skip_drop:
            interactive = DB_MODE != "remote" and not FORCE
            if interactive:
                print(f"WARNING: This will DROP all tables and recreate them on {db.engine.url.drivername}")
                confirm = input("Type 'yes' to continue: ")
                if confirm.lower() != "yes":
                    print("Aborted.")
                    return
            print("Dropping all tables and recreating...")
            db.drop_all()
            db.create_all()
        else:
            print(f"Seeding without dropping tables on {db.engine.url.drivername}")
            db.create_all()

        next_sku = _auto_sku(Product.query.all()) + 1

        # ── 1. LOCATIONS ──
        print("Seeding Locations...")
        locs = [
            Location(name="Storehouse", address="123 Industrial Zone, Main City", is_active=True, is_storehouse=True),
            Location(name="Branch 1", address="456 Commercial Ave, Downtown", is_active=True),
            Location(name="Branch 2", address="789 Suburb Road, North District", is_active=True),
        ]
        db.session.add_all(locs)
        db.session.flush()
        storehouse = locs[0]

        # ── 2. USERS ──
        # usertype: 0=Staff(no access), 1=Owner, 2=Manager, 3=Admin
        print("Seeding Users...")
        users_data = [
            (1, "owner",    "owner@mcm.com",    "260512001", 0),
            (2, "manager",  "manager@mcm.com",  "260512002", 2),
            (2, "manager2", "manager2@mcm.com", "260512007", 1),
            (3, "admin",    "admin@mcm.com",    "260512003", 0),
            (3, "admin2",   "admin2@mcm.com",   "260512008", 1),
        ]
        users = []
        for ut, uname, email, emp, lid in users_data:
            u = User(
                usertype=ut, username=uname, email=email,
                password=generate_password_hash("password"),
                location_id=lid, employee_code=emp,
            )
            db.session.add(u)
            users.append(u)
        db.session.flush()

        # ── 3. CATEGORIES ──
        print("Seeding Categories...")
        cat_all = []
        for cdef in [
            ("Fabrics", "Fabric materials for upholstery and clothing"),
            ("Trims & Accessories", "Trims, buttons, zippers and other accessories"),
            ("Threads & Sewing", "Threads, needles and sewing supplies"),
            ("Tools & Equipment", "Cutting tools, rulers and equipment"),
        ]:
            c = Category(name=cdef[0], description=cdef[1], is_active=True)
            db.session.add(c)
            cat_all.append(c)
        db.session.flush()
        cat_fabrics, cat_trims, cat_threads, cat_tools = cat_all

        # ── 4. PRODUCTS ──
        print("Seeding Products...")
        product_defs = [
            # ── Fabrics (55) ──
            (cat_fabrics.category_id, "FELT HARD 1", 120, "10", "piece"),
            (cat_fabrics.category_id, "FELT HARD 2", 130, "10", "piece"),
            (cat_fabrics.category_id, "FLEECE", 180, "8", "piece"),
            (cat_fabrics.category_id, "HI-PILE", 250, "5", "piece"),
            (cat_fabrics.category_id, "12MM CIRCULAR", 200, "10", "piece"),
            (cat_fabrics.category_id, "8MM AND 20MM PLUSH", 220, "8", "piece"),
            (cat_fabrics.category_id, "7MM AND 20MM PLUSH", 230, "8", "piece"),
            (cat_fabrics.category_id, "3MM PRINTED FUR", 280, "5", "piece"),
            (cat_fabrics.category_id, "SHAGGY FUR", 300, "5", "piece"),
            (cat_fabrics.category_id, "NYLEX 220G", 90, "15", "piece"),
            (cat_fabrics.category_id, "VELBOA KOREA", 350, "5", "piece"),
            (cat_fabrics.category_id, "LAMB FUR 2323", 400, "3", "piece"),
            (cat_fabrics.category_id, "VELVET 1", 160, "10", "piece"),
            (cat_fabrics.category_id, "VELVET 2", 170, "10", "piece"),
            (cat_fabrics.category_id, "VELBOA SUPER SOFT", 380, "5", "piece"),
            (cat_fabrics.category_id, "PRINTED DESIGN", 150, "10", "piece"),
            (cat_fabrics.category_id, "SUEDE GAMOSA", 200, "8", "piece"),
            (cat_fabrics.category_id, "NEON WOVEN CLOTH", 100, "15", "piece"),
            (cat_fabrics.category_id, "FEATHERS", 50, "20", "piece"),
            (cat_fabrics.category_id, "COTTON CANVAS", 140, "12", "meter"),
            (cat_fabrics.category_id, "LINEN FABRIC", 190, "10", "meter"),
            (cat_fabrics.category_id, "DENIM BLUE", 210, "8", "meter"),
            (cat_fabrics.category_id, "SATIN SILK", 320, "5", "meter"),
            (cat_fabrics.category_id, "POLYESTER MESH", 85, "20", "meter"),
            (cat_fabrics.category_id, "LEATHERETTE", 260, "6", "meter"),
            (cat_fabrics.category_id, "TWEED WOOL", 340, "4", "meter"),
            (cat_fabrics.category_id, "CHIFFON", 110, "15", "meter"),
            (cat_fabrics.category_id, "ORGANZA", 130, "12", "meter"),
            (cat_fabrics.category_id, "BROCADE GOLD", 450, "3", "meter"),
            (cat_fabrics.category_id, "JERSEY KNIT", 160, "10", "meter"),
            (cat_fabrics.category_id, "MUSLIN", 90, "15", "meter"),
            (cat_fabrics.category_id, "CALICO", 100, "15", "meter"),
            (cat_fabrics.category_id, "TULLE", 75, "20", "meter"),
            (cat_fabrics.category_id, "VELVETEEN", 200, "8", "meter"),
            (cat_fabrics.category_id, "BURLAP", 60, "25", "meter"),
            (cat_fabrics.category_id, "FELT SOFT", 110, "12", "piece"),
            (cat_fabrics.category_id, "POLAR FLEECE", 240, "6", "meter"),
            (cat_fabrics.category_id, "RIPSTOP NYLON", 180, "8", "meter"),
            (cat_fabrics.category_id, "WATERPROOF FABRIC", 220, "6", "meter"),
            (cat_fabrics.category_id, "MESH NETTING", 70, "20", "meter"),
            (cat_fabrics.category_id, "STRETCH VELVET", 190, "8", "meter"),
            (cat_fabrics.category_id, "PIQUE KNIT", 150, "10", "meter"),
            (cat_fabrics.category_id, "INTERLOCK COTTON", 140, "12", "meter"),
            (cat_fabrics.category_id, "OXFORD CLOTH", 170, "10", "meter"),
            (cat_fabrics.category_id, "POPLIN", 120, "12", "meter"),
            (cat_fabrics.category_id, "SATEEN WEAVE", 200, "8", "meter"),
            (cat_fabrics.category_id, "FLANNEL", 160, "10", "meter"),
            (cat_fabrics.category_id, "JACQUARD", 280, "5", "meter"),
            (cat_fabrics.category_id, "GEORGETTE", 130, "12", "meter"),
            (cat_fabrics.category_id, "DOUBLE GAUZE", 110, "15", "meter"),
            (cat_fabrics.category_id, "TERRY CLOTH", 180, "8", "meter"),
            (cat_fabrics.category_id, "NEOPRENE", 350, "4", "meter"),
            (cat_fabrics.category_id, "FAUX LEATHER", 270, "6", "meter"),
            (cat_fabrics.category_id, "CHENILLE", 220, "7", "meter"),
            (cat_fabrics.category_id, "HERRINGBONE", 290, "5", "meter"),
            # ── Trims & Accessories (7) ──
            (cat_trims.category_id, "Metallic Zipper 20cm", 15, "50", "piece"),
            (cat_trims.category_id, "Plastic Buttons 20mm", 5, "100", "piece"),
            (cat_trims.category_id, "Elastic Band 2cm", 8, "80", "meter"),
            (cat_trims.category_id, "Satin Ribbon 1cm", 12, "60", "meter"),
            (cat_trims.category_id, "Velcro Tape 5cm", 10, "70", "meter"),
            (cat_trims.category_id, "Metal Buckle 3cm", 18, "40", "piece"),
            (cat_trims.category_id, "Snap Fastener Set", 7, "90", "set"),
            # ── Threads & Sewing (6) ──
            (cat_threads.category_id, "Polyester Thread White", 3, "200", "spool"),
            (cat_threads.category_id, "Polyester Thread Black", 3, "200", "spool"),
            (cat_threads.category_id, "Nylon Thread Clear", 5, "150", "spool"),
            (cat_threads.category_id, "Sewing Needles Assorted", 6, "100", "pack"),
            (cat_threads.category_id, "Pins with Glass Heads", 4, "120", "pack"),
            (cat_threads.category_id, "Tailor's Chalk", 2, "150", "piece"),
            # ── Tools & Equipment (7) ──
            (cat_tools.category_id, "Fabric Scissors 10in", 180, "10", "piece"),
            (cat_tools.category_id, "Measuring Tape 150cm", 15, "40", "piece"),
            (cat_tools.category_id, "Rotary Cutter 45mm", 220, "8", "piece"),
            (cat_tools.category_id, "Cutting Mat A2", 350, "5", "piece"),
            (cat_tools.category_id, "Seam Ripper", 45, "15", "piece"),
            (cat_tools.category_id, "Pin Cushion", 60, "12", "piece"),
            (cat_tools.category_id, "Tracing Wheel", 85, "10", "piece"),
        ]

        all_products = []
        for cid, name, price, reorder, unit in product_defs:
            sku = f"PROD-{next_sku:03d}"
            next_sku += 1
            p = Product(
                category_id=cid, name=name, price=price,
                reorder_level=reorder, sku=sku, unit=unit,
                is_active=True,
                auto_restock_source_id=storehouse.location_id,
            )
            db.session.add(p)
            all_products.append(p)
        db.session.flush()

        # ── 4b. VARIETIES (for fabric products) ──
        print("Seeding Varieties...")
        COLORS = [
            ("#FF0000", "Red"), ("#0070C0", "Blue"), ("#00B050", "Green"),
            ("#000000", "Black"), ("#FFFFFF", "White"), ("#FFFF00", "Yellow"),
            ("#7030A0", "Purple"), ("#FF7F00", "Orange"),
        ]
        PATTERNS = ["Solid", "Striped", "Polka Dot", "Floral", "Plaid", "Geometric", "Chevron", "Abstract"]

        fabric_products = [p for p in all_products if p.category_id == cat_fabrics.category_id]
        all_varieties = []
        for p in fabric_products:
            n = random.randint(3, 5)
            chosen_colors = random.sample(COLORS, min(n, len(COLORS)))
            for i, (hex_val, color_name) in enumerate(chosen_colors):
                pattern = random.choice(PATTERNS)
                vs = f"{p.sku}-{i + 1:02d}"
                v = ProductVariety(
                    product_id=p.product_id,
                    variety_sku=vs,
                    color=color_name,
                    pattern=pattern,
                )
                db.session.add(v)
                all_varieties.append(v)
        db.session.flush()
        fabric_varieties = {p.product_id: [v for v in all_varieties if v.product_id == p.product_id] for p in fabric_products}
        print("Seeding Inventory...")
        # Track inventory in memory for order deduction
        inv_map = {}
        for p in all_products:
            p_varieties = fabric_varieties.get(p.product_id, [])
            for loc in locs:
                qty = random.randint(50, 200) if loc == storehouse else random.randint(15, 80)
                if p_varieties:
                    remaining = qty
                    per_variety = max(1, qty // (len(p_varieties) + 1))
                    for v in p_varieties:
                        v_qty = min(per_variety, remaining)
                        if v_qty > 0:
                            db.session.add(Inventory(product_id=p.product_id, variety_id=v.variety_id, location_id=loc.location_id, quantity=v_qty))
                            inv_map[(p.product_id, loc.location_id, v.variety_id)] = v_qty
                            remaining -= v_qty
                    db.session.add(Inventory(product_id=p.product_id, location_id=loc.location_id, quantity=remaining))
                    inv_map[(p.product_id, loc.location_id)] = remaining
                else:
                    db.session.add(Inventory(product_id=p.product_id, location_id=loc.location_id, quantity=qty))
                    inv_map[(p.product_id, loc.location_id)] = qty
        db.session.flush()

        # ── 6. ORDERS + ITEMS + PAYMENTS (with inventory deduction) ──
        print("Seeding Orders, Items, Payments...")
        statuses = ["completed", "completed", "completed", "pending", "cancelled", "voided"]
        methods = ["Cash", "Card", "Bank Transfer", "GCash"]
        now = datetime.now()

        for _ in range(SEED_ORDERS):
            loc = random.choice(locs)

            # Skew dates toward recent so dashboards show meaningful data
            weight = random.random()
            if weight < 0.10:
                odate = now - timedelta(hours=random.randint(1, 12), minutes=random.randint(0, 59))
            elif weight < 0.30:
                odate = now - timedelta(days=random.randint(1, 7), hours=random.randint(0, 23), minutes=random.randint(0, 59))
            elif weight < 0.60:
                odate = now - timedelta(days=random.randint(8, 30), hours=random.randint(0, 23), minutes=random.randint(0, 59))
            else:
                odate = now - timedelta(days=random.randint(31, 90), hours=random.randint(0, 23), minutes=random.randint(0, 59))

            available = [p for p in all_products if inv_map.get((p.product_id, loc.location_id), 0) > 1]
            if not available:
                continue
            n = random.randint(1, min(5, len(available)))
            chosen = random.sample(available, n)

            items = []
            for p in chosen:
                p_varieties = fabric_varieties.get(p.product_id, [])
                if p_varieties:
                    # For fabric products with varieties, pick a random variety
                    v = random.choice(p_varieties)
                    max_qty = inv_map.get((p.product_id, loc.location_id, v.variety_id), 0)
                    if max_qty < 1:
                        continue
                    qty = random.randint(1, min(5, max_qty))
                    items.append((p.product_id, qty, p.price, v.variety_id))
                    inv_map[(p.product_id, loc.location_id, v.variety_id)] -= qty
                else:
                    max_qty = inv_map.get((p.product_id, loc.location_id), 0)
                    if max_qty < 1:
                        continue
                    qty = random.randint(1, min(5, max_qty))
                    items.append((p.product_id, qty, p.price, None))
                    inv_map[(p.product_id, loc.location_id)] -= qty

            if not items:
                continue

            total = sum(q * pr for _, q, pr, _ in items)

            order = Order(location_id=loc.location_id, order_date=odate,
                          status=random.choice(statuses), total_amount=total)
            db.session.add(order)
            db.session.flush()

            for pid, qty, pr, vid in items:
                db.session.add(OrderItem(order_id=order.order_id, product_id=pid, variety_id=vid, quantity=qty, price=pr))
            db.session.add(Payment(order_id=order.order_id, payment_method=random.choice(methods),
                                   quantity=sum(q for _, q, _, _ in items), price=total))
        db.session.flush()

        # Write final inventory quantities back to DB
        for key, qty in inv_map.items():
            if len(key) == 3:
                pid, lid, vid = key
                inv_row = Inventory.query.filter_by(product_id=pid, location_id=lid, variety_id=vid).first()
            else:
                pid, lid = key
                inv_row = Inventory.query.filter_by(product_id=pid, location_id=lid, variety_id=None).first()
            if inv_row:
                inv_row.quantity = qty
        db.session.flush()

        # Zero out ~10% of branch entries to simulate out-of-stock scenarios
        branch_entries = [key for key in inv_map if key[1] != storehouse.location_id]
        random.shuffle(branch_entries)
        to_zero = int(len(branch_entries) * 0.1)
        for key in branch_entries[:to_zero]:
            if len(key) == 3:
                pid, lid, vid = key
                inv_row = Inventory.query.filter_by(product_id=pid, location_id=lid, variety_id=vid).first()
            else:
                pid, lid = key
                inv_row = Inventory.query.filter_by(product_id=pid, location_id=lid, variety_id=None).first()
            if inv_row:
                inv_row.quantity = 0
        db.session.flush()

        # ── 7. STOCK TRANSFERS ──
        print("Seeding Stock Transfers...")
        tstatus = ["pending", "approved", "completed", "cancelled"]
        for _ in range(SEED_TRANSFERS):
            fl, tl = random.sample(locs, 2)
            db.session.add(StockTransfer(
                product_id=random.choice(all_products).product_id,
                from_location_id=fl.location_id, to_location_id=tl.location_id,
                user_id=random.choice(users).user_id,
                quantity=random.randint(5, 50),
                transfer_date=now - timedelta(days=random.randint(0, 180), hours=random.randint(0, 23)),
                status=random.choice(tstatus),
            ))
        db.session.flush()

        # ── 8. STOCK ADJUSTMENTS ──
        print("Seeding Stock Adjustments...")
        reasons = ["Damaged goods", "Inventory count correction", "Sample material",
                    "Quality check removal", "Supplier return", "Damaged in transit",
                    "Employee discount adjustment"]
        for _ in range(SEED_ADJUSTMENTS):
            db.session.add(StockAdjustment(
                product_id=random.choice(all_products).product_id,
                location_id=random.choice(locs).location_id,
                user_id=random.choice(users).user_id,
                quantity_change=random.choice([-50, -20, -10, -5, -3, 5, 10, 15, 25]),
                reason=random.choice(reasons),
                date=now - timedelta(days=random.randint(0, 180), hours=random.randint(0, 23)),
            ))
        db.session.flush()

        # ── 9. STOCK REQUESTS ──
        print("Seeding Stock Requests...")
        sreq_statuses = ["pending", "approved", "declined"]
        branch_users = [u for u in users if u.usertype == 2]
        for _ in range(SEED_STOCK_REQUESTS):
            branch_loc = random.choice(locs[1:])  # branch, not storehouse
            requester = random.choice(branch_users) if branch_users else random.choice(users)
            status = random.choice(sreq_statuses)
            created = now - timedelta(days=random.randint(0, 60), hours=random.randint(0, 23))
            db.session.add(StockRequest(
                product_id=random.choice(all_products).product_id,
                from_location_id=storehouse.location_id,
                to_location_id=branch_loc.location_id,
                requested_by=requester.user_id,
                quantity=random.randint(5, 30),
                description=random.choice([
                    "Running low on stock",
                    "Customer demand increased",
                    "Seasonal restock needed",
                    "Urgent: nearly out of stock",
                ]),
                status=status,
                created_at=created,
                updated_at=created,
            ))
        db.session.flush()

        # ── 10. STORE REPORTS ──
        print("Seeding Store Reports...")
        issue_types = ["store", "materials", "software"]
        report_statuses = ["pending", "resolved", "voided"]
        report_titles = [
            "Broken shelf in storage area",
            "Air conditioning not working",
            "Fabric delivery damaged",
            "Wrong thread colors received",
            "POS system slow during peak hours",
            "Lighting fixture needs replacement",
            "Water leak near storage room",
            "Inventory count mismatch on trims",
            "Scanner not reading barcodes",
            "Safety hazard on cutting table",
        ]
        for _ in range(SEED_STORE_REPORTS):
            loc = random.choice(locs)
            reporter = random.choice(users)
            status = random.choice(report_statuses)
            resolved_by_user = random.choice(users).user_id if status == "resolved" else None
            resolved_at = now - timedelta(days=random.randint(1, 30)) if resolved_by_user else None
            db.session.add(StoreReport(
                user_id=reporter.user_id,
                location_id=loc.location_id,
                title=random.choice(report_titles),
                issue_type=random.choice(issue_types),
                description=f"Reported issue at {loc.name}. Needs attention from the team.",
                status=status,
                resolved_by=resolved_by_user,
                resolved_at=resolved_at,
                created_at=now - timedelta(days=random.randint(0, 60), hours=random.randint(0, 23)),
            ))
        db.session.flush()

        # ── 11. NOTIFICATIONS (linked to pending stock requests) ──
        # Notifications are created automatically by check_and_auto_restock()
        # during order creation. No need to seed them explicitly.

        # ── 12. ACTIVITY LOGS ──
        print("Seeding Activity Logs...")
        activities = [
            ("auth", "login", "Logged in"),
            ("auth", "login", "Logged in"),
            ("products", "create", "Created product"),
            ("products", "update", "Updated product"),
            ("inventory", "adjust", "Adjusted inventory"),
            ("categories", "create", "Created category"),
            ("locations", "create", "Created location"),
            ("inventory", "adjust", "Stock adjustment"),
            ("products", "update", "Updated product price"),
            ("inventory", "adjust", "Inventory count correction"),
            ("orders", "create", "Created order"),
            ("orders", "complete", "Completed order"),
            ("reports", "create", "Filed store report"),
            ("stock", "transfer", "Transferred stock"),
        ]
        for _ in range(SEED_ACTIVITY_LOGS):
            mod, typ, act = random.choice(activities)
            db.session.add(ActivityLog(
                user_id=random.choice(users).user_id,
                module=mod, action_type=typ, action=act,
                timestamp=now - timedelta(days=random.randint(0, 180),
                                          hours=random.randint(0, 23),
                                          minutes=random.randint(0, 59)),
            ))
        db.session.flush()

        # ── 13. MANUAL SECTIONS ──
        seed_manual_sections()
        seed_manager_manual()
        seed_admin_manual()
        db.session.flush()

        db.session.commit()
        print("\n[OK] Database seeded successfully!")
        print(f"  Locations:       {len(locs)}")
        print(f"  Users:           {len(users_data)}")
        print(f"  Categories:      4")
        print(f"  Products:        {len(all_products)}")
        print(f"  Varieties:       {len(all_varieties)}")
        print(f"  Inventory:       {len(inv_map)}")
        print(f"  Orders:          {SEED_ORDERS}")
        print(f"  Transfers:       {SEED_TRANSFERS}")
        print(f"  Adjustments:     {SEED_ADJUSTMENTS}")
        print(f"  Stock Requests:  {SEED_STOCK_REQUESTS}")
        print(f"  Store Reports:   {SEED_STORE_REPORTS}")
        print(f"  Notifications:   {Notification.query.count()} (auto-generated)")
        print(f"  Activity Logs:   {SEED_ACTIVITY_LOGS}")
        print(f"  Manual Sections: {ManualSection.query.count()} (owner: {len(owner_sections)}, manager, admin)")


def seed_manual_sections():
    print("Seeding Owner Manual...")
    if ManualSection.query.first():
        print("[OK] Manual sections already exist. Skipping.")
        return
    global owner_sections
    owner_sections = [
        # --- 1. Getting Started ---
        ManualSection(role="owner", parent_id=None, sort_order=1, title="Getting Started",
            content="""### System Overview

Manco (MCM) Trading is a full-featured inventory, stock, and sales management system. As the **Owner**, you have unrestricted access to all modules and features, including full create, read, update, and delete permissions.

### Logging In

1. Open your browser and navigate to the system URL.
2. Enter your **Username** and **Password** on the login page.
3. Click **Sign In**.
4. You will be redirected to the **Owner Dashboard**.

> **Tip:** If you forget your password, click the **Forgot Password?** link on the login page to receive a reset link via email.

### Dashboard Layout

After logging in, the main interface consists of four areas:

- **Sidebar** (left) — Navigation menu for all modules. Click any item to switch pages. The sidebar can be collapsed using the hamburger icon at the top.
- **Topbar** (top) — Notification bell and Logout button.
- **Content Area** (center) — The main workspace where the selected module is displayed.
- **Footer** (bottom) — System copyright information.

### Branch Selection

Branch filtering is available **within individual modules** (Inventory, Sales, Stock Management, Reports) via a location dropdown:

- **All Branches** — Shows data across every location.
- **Specific Branch** — Shows data for that location only.

> **Note:** Some actions (e.g., Adjust Stock) require a specific branch to be selected — they are disabled when "All Branches" is active.

### Dark Mode & Font Size

1. Go to **Settings** → **Personalization**.
2. Choose **Light** or **Dark** theme.
3. Choose your preferred **Font Size** (Small, Medium, Large, Extra Large).
4. Click **Save Preferences**. The change applies immediately across the entire system."""),

            # --- 2. Owner Dashboard ---
            ManualSection(role="owner", parent_id=None, sort_order=2, title="Owner Dashboard",
                content="""The Owner Dashboard provides a high-level overview of the entire business. It is the first page you see after logging in and is located at **Dashboard** in the sidebar.

### Stat Cards

Four stat cards appear at the top:

| Card | Description |
|---|---|
| **Total Inventory Items** | Sum of all stock quantities across all branches |
| **Sales Today** | Total revenue generated today |
| **Low Stock Alerts** | Number of products below their reorder level |
| **Active Users** | Number of users who have logged in recently |

Each card shows:
- The current value
- A **trend indicator** (up/down arrow with percentage change compared to last week)
- A **View** button to drill down into detailed data

### Stock Health Bar

Below the stat cards, a horizontal bar visualizes the overall health of your inventory:
- **Green** segment — Items that are adequately stocked
- **Orange** segment — Items that are low stock

### Stock Movement Chart

This 7-day composed chart shows:
- **Green bars** — Stock received (in)
- **Red bars** — Stock sold or removed (out)
- **Blue line** — 3-day moving average of stock-in, smoothing daily fluctuations

Below the chart:
- **Net change** — Total in minus total out for the week
- **Stock runway** — Estimated number of days until stock runs out at the current outflow rate

### Stock by Category (Donut Chart)

A visual breakdown of inventory distribution across product categories. Hover over each segment to see exact quantities.

### Recent Transactions

A table showing the most recent sales transactions with product, quantity, amount, branch, and status. Click any row or the **View All Sales** button to open a detailed modal.

### Low Stock Items

A table listing products that need attention. Items are highlighted:
- **Red row** — Out of stock (quantity = 0)
- **Orange row** — Low stock (quantity ≤ 5)

Click **View All** to open the Stock Alerts modal with full details."""),

            # --- 3. Inventory Management ---
            ManualSection(role="owner", parent_id=None, sort_order=3, title="Inventory Management",
                content="""The Inventory module allows you to manage the product catalog. Access it via **Inventory** in the sidebar.

### Viewing Products

The products table displays:
- **Product Name** — Click column header to sort alphabetically
- **Category** — Sorted by category name
- **Stock Quantity** — Current stock across the selected branch
- **Unit** — Measurement unit (piece, meter, yard, etc.)
- **Base Price** — Selling price in Philippine Pesos
- **Reorder Level** — Minimum stock threshold
- **Status** — Active (green) or Voided (red)

**Filters:**
- **Search** — Type a product name to filter the list
- **Category Filter** — Select a category from the dropdown

### Adding a Product

1. Click the **Add Product** button.
2. Fill in the form:
   - **Product Name** (required)
   - **Category** (required — select from the dropdown)
   - **SKU** (auto-generated if left blank)
   - **Base Price** (required — enter amount in ₱)
   - **Unit** (e.g., piece, meter, yard)
   - **Reorder Level** (when stock drops below this, the system flags it as low)
   - **Description** (optional notes)
3. Click **Save**.

### Editing a Product

1. Click **Edit** on the desired product row.
2. Modify any fields in the form.
3. Click **Save**.

> **Note:** The SKU field is only shown when creating a new product, not during editing.

### Adjusting Stock

1. Select a **specific branch** from the location dropdown in the module header (not "All Branches").
2. Click **Adjust** on the product row.
3. Choose **Add Stock** (increase) or **Remove Stock** (decrease).
4. Enter the quantity and a reason (e.g., "New shipment", "Damaged goods").
5. Click **Save**.

### Voiding a Product

1. Click **Void** on an active product.
2. Confirm the action in the popup dialog.
3. The product's status changes to **Voided** (red tag).
4. Voided products no longer appear in POS or stock operations but remain in the database.

### Deleting a Voided Product

1. After voiding, the **Delete** button appears.
2. Click **Delete** and confirm to permanently remove the product.
3. This action **cannot be undone**."""),

            # --- 4. Sales Module ---
            ManualSection(role="owner", parent_id=None, sort_order=4, title="Sales Module",
                content="""The Sales module handles transaction creation, viewing, and management. Access it via **Sales** in the sidebar.

### Sales Overview Stats

Three stat cards at the top provide a quick snapshot:
- **Total Sales Today** — Revenue generated today
- **Total Sales This Month** — Revenue generated this month
- **Total Transactions Today** — Number of orders placed today

### Viewing Transactions

The transactions table includes:
- **Transaction ID** — Unique order number (click to sort)
- **Branch** — Where the sale occurred
- **Date** — Order date
- **Items** — Product names (expand by clicking on items with multiple products)
- **Total Amount** — Order total in ₱
- **Payment** — Payment method and amount received
- **Status** — Completed (green) or Voided (red)
- **Actions** — View Receipt and Void buttons

**Filters:**
- **Search** — Type a transaction ID
- **Date Range** — Filter by order date
- **Status** — Show only Completed or Voided transactions

### Creating a Sale (POS)

Click **Add Sale** to open the Point-of-Sale modal:

**Step 1 — Select Category:**
- Browse available categories displayed as cards.
- Click a category to view its products.

**Step 2 — Add Products:**
- **Quick Add** — Tap a product card to add one unit to cart.
- **Custom Quantity** — Long-press (hold for 500ms) a product card to open a quantity selector.
- Products already in cart show a red border and "In cart" label.

**Step 3 — Review Cart:**
The right panel shows your cart with:
- Product name and per-item total
- **+ / -** buttons to adjust quantities
- **Delete** button to remove an item
- **Grand Total** displayed at the bottom

**Step 4 — Process Payment:**
- Click **Confirm Order** to proceed to payment.
- Select the **Order Date** (defaults to today).
- Choose a **Payment Method** (Cash, Card, GCash, Bank Transfer).
- Enter the **Payment Amount** (must be at least the grand total).
- The **Change** is computed automatically.
- Click **Confirm Payment** to finalize.

### Receipt

After confirming, a receipt modal appears with:
- Company information (name, address, VAT TIN)
- Line items with quantities and amounts
- Total amount, payment received, and change
- VAT breakdown (Vatable Sales, VAT 12%)
- BIR-mandated fields (MIN No., Sales Invoice No., POS Permit)

Click **Print Receipt** or **Close**.

### Viewing Receipts

Click **View Receipt** on any past transaction to re-open the receipt modal with full details.

### Voiding a Transaction

1. Click **Void** on the transaction row.
2. Confirm by clicking **Yes** in the popup.
3. The transaction status changes to **Voided**.
4. The system automatically restores the inventory quantities.

> **Important:** Voiding a transaction reverses the stock deduction. If auto-restock was triggered during the original sale, the receipt will note this.

### Viewing Total Sales

Click **View Total Sales** to open an aggregated view:
- **Branch Filter** (Owner only) — Select a specific branch or "All Branches".
- **Date Range** — Filter the period.
- **Aggregated Table** — Shows each product with:
  - Total Quantity Sold
  - Total Amount
  - A **Summary Row** at the bottom with the grand total.

### Auto-Restock

When a sale causes stock to drop below the reorder level, the system automatically transfers stock from the **Storehouse** location. This is noted on the receipt with the product name and quantity transferred."""),

            # --- 5. Stock Management ---
            ManualSection(role="owner", parent_id=None, sort_order=5, title="Stock Management",
                content="""The Stock Management module provides detailed control over inventory quantities across all branches. Access it via **Stock Management** in the sidebar.

### Stock Overview Stats

Three cards at the top:
- **Total Items** — Sum of all inventory quantities
- **Low Stock** — Products below their reorder level (≤ reorder_level)
- **Out of Stock** — Products with zero quantity

### Inventory Table

The main table shows stock levels per product per branch with:
- **Product Name** and **SKU**
- **Branch** — Location name
- **Quantity** — Current stock
- **Status** tag — Green (In Stock), Orange (Low Stock, ≤10), Red (Out of Stock, =0)
- **Actions** — Adjust, Transfer, Request Stock, View Details, Set Reorder

**Filters & Sort:**
- **Search** by product name
- **Sort by** dropdown (Product Name, Category, Quantity, Status)
- **Sort order** (Ascending / Descending)
- **Status filter** (In Stock / Low Stock / Out of Stock)

### Adjusting Stock

1. Select a **specific branch** (not "All Branches").
2. Click **Adjust** on the desired row.
3. Choose **Add Stock** or **Remove Stock**.
4. Select a **Reason** (Restock, Damaged, Correction, Sample, Sales Return).
5. Enter quantity and optional remarks.
6. Click **Save**.

### Stock Transfers

Move stock between branches:
1. Click **Transfer** on a product row.
2. The **From Location** is pre-set to the current branch.
3. Select the **To Location** (destination branch).
4. Enter the **Quantity** and optional **Remarks**.
5. Optionally set a **Transfer Date** (defaults to now).
6. Click **Save**.

### Stock Requests

Request stock from the storehouse:
1. Click **Request Stock** on a product row.
2. Select the **From Location** (usually the storehouse).
3. Enter the **Quantity** needed.
4. Add a **Description** explaining why.
5. Click **Submit**.
6. The request appears in the Owner's notification panel for approval.

### Movement History

Click **View Details** on any product to see:
- Product information (name, SKU, category, unit)
- A **Movement History** table showing each stock change:
  - Date and time
  - Type (Adjustment, Transfer In, Transfer Out, Sale, Restock)
  - Quantity change (+/-)
  - Location
  - Reason

### Setting Reorder Levels

1. Click **Set Reorder** on a product row.
2. Enter the new reorder level.
3. Click **Save**.
4. The product will now trigger low-stock alerts when quantity drops below this level.

### Bulk Restock

Restock multiple low-stock items at once:
1. Click **Bulk Restock Below Reorder**.
2. A checklist appears showing all products below their reorder level, with the storehouse as source.
3. For each product, you can override the default quantity.
4. Click **Generate Order Summary** to review.
5. Confirm to execute all restocks simultaneously.

### Restock All Below Threshold

Click **Restock All Below Threshold** to automatically restock every product whose current quantity is below its reorder level. The system restocks up to the reorder level from the storehouse."""),

            # --- 6. User Access ---
            ManualSection(role="owner", parent_id=None, sort_order=6, title="User Access Management",
                content="""The User Access module lets you manage system users and their permissions. Access it via **Manage Users** in the sidebar (Owner only).

### Viewing Users

The table lists all registered users with:
- **Username** — Login name
- **Email** — User's email address
- **Role** — Owner, Manager, or Admin
- **Location** — Assigned branch
- **Status** — Active or Inactive

### Editing User Roles

1. Click **Edit** on the desired user row.
2. The Role field becomes a dropdown. Select the new role:
   - **Owner** — Full access to everything
   - **Manager** — Read/update access, branch-scoped. Cannot create or delete.
   - **Admin** — Full access, limited to maintenance and settings modules.
3. Changes take effect immediately.

### Assigning Locations

1. In edit mode, the **Location** field becomes a dropdown.
2. Select the branch the user should be associated with.
3. Managers are automatically scoped to their assigned location in all modules.

### Restrictions

- **Owner accounts** cannot have their **Location** changed (the dropdown is disabled).
- Only the **Owner** role can access the User Access page.
- Managers attempting to navigate to this URL will see a 403 error message.

### Permission Matrix

| Action | Owner | Manager | Admin |
|---|---|---|---|
| Create products | ✓ | ✗ | — |
| Edit products | ✓ | ✓ | — |
| Delete products | ✓ | ✗ | — |
| Create sales | ✓ | ✓ | — |
| Void transactions | ✓ | ✓ | — |
| Manage users | ✓ | ✗ | — |
| Maintenance | ✓ | ✗ | ✓ |
| Settings | ✓ | ✓ | ✓ |
| Reports | ✓ | ✓ | ✓ |"""),

            # --- 7. Reports ---
            ManualSection(role="owner", parent_id=None, sort_order=7, title="Reports",
                content="""The Reports module provides data analysis and reporting tools. Access it via **Reports** in the sidebar.

### Inventory Reports

**Stock Levels by Branch:**
- Table view: Branch name, total items, total quantity.
- Chart view: Bar chart visual comparison. Toggle between table/chart with the button in the card header.

**Stock Distribution:**
- Pie chart showing the proportion of stock across branches.
- Use the **Filter by Product** dropdown to see distribution for a specific product.

**Low Stock Items:**
- Table listing all low-stock products with product name, SKU, branch, current stock, and reorder level.

### Sales Reports

- **Period Selector** — Choose 7, 30, or 90 days.
- **Stats Cards** — Total Orders, Total Revenue, Avg Order Value.
- **Daily Sales Trend** — Bar chart of revenue per day.
- **Top Products** — Table of best-selling products by quantity and revenue.

### Financial Reports

- **Period Selector** — 30, 90, or 365 days.
- **Stats Cards** — Total Revenue and Total Orders.
- **Revenue by Date** — Table with date, order count, and revenue.
- **Payment Methods** — Breakdown of transactions and amounts by payment method (Cash, Card, GCash, Bank Transfer).

### Activity Reports

- **Period Selector** — 7, 30, or 90 days.
- **Stats Cards** — Total Actions and Unique Users.
- **Per-User Activity** — Table of actions performed by each user.
- **Per-Module Activity** — Table of actions grouped by module.

**Store Reports:**
- Create, edit, and view issue reports.
- **Issue Types:** Store Issue, Software Issue.
- **Statuses:** Pending (orange), Resolved (green), Voided (red).
- Click **Resolve** to mark a pending report as resolved (shows who resolved it and when).
- Only the report creator can edit or void their own pending reports.

### System Reports

- **Stats Cards** — Backups count, Activity in last 7 days, Activity in last 30 days.
- **Backup History** — Table of backup files with filename, size, and creation date."""),

            # --- 8. System Maintenance ---
            ManualSection(role="owner", parent_id=None, sort_order=8, title="System Maintenance",
                content="""The Maintenance module provides database administration tools. Access it via **Maintenance** in the sidebar.

### System Information

View key database metrics:
- **Database Size** — Current size on disk
- **SQLite Version** — Database engine version
- **Backups** — Number of existing backups
- **Application** — App name and version
- **Table Records** — Count of records in each table

### Backup & Restore

**Create Backup:**
1. Go to the **Backup & Restore** tab.
2. Click **Create Backup**.
3. The system creates a JSON dump of all tables.
4. The backup appears in the list with filename, size, and timestamp.

**Restore from Backup:**
1. Find the backup file in the list.
2. Click **Restore**.
3. Confirm the action. **This will replace the current database** with the backup.
4. The system restarts with the restored data.

**Delete Backup:**
1. Click **Delete** on a backup file.
2. Confirm to permanently remove it.

### Integrity Check

1. Go to the **Maintenance** tab.
2. Click **Run Integrity Check**.
3. Results show:
   - **Passed / Failed** status
   - **FK Violations** count
   - Detailed list of any issues found

### Database Optimization

**VACUUM Database:**
- Reclaims unused space in the database file.
- Shows size before, size after, space saved, and duration.

**REINDEX:**
- Rebuilds all database indexes for better query performance.
- Shows duration and confirms indexes rebuilt.

### Data Cleanup

1. Go to the **Cleanup** tab.
2. Configure the **Retention Period** (days). Default: 90.
3. Select categories to clean:
   - **Purge old activity logs**
   - **Permanently delete voided products**
   - **Clean old/cancelled transfers**
4. Click **Run Cleanup**.
5. Confirm the action. Results show how many records were deleted per category."""),

            # --- 9. Notifications ---
            ManualSection(role="owner", parent_id=None, sort_order=9, title="Notifications",
                content="""The notification system keeps you informed of pending stock requests from managers and system alerts.

### Bell Icon

- Located in the **Topbar** next to the Logout button.
- A badge shows the combined count of **pending stock requests** and **system notifications**.
- The counter updates automatically every 30 seconds.
- > **Note:** Notifications are fetched per-branch. When viewing "All Locations", the badge count may not reflect all pending requests.

### Pending Requests Panel

Click the bell icon to open the notification panel. Each request shows:
- **Requester** — The manager who submitted the request (with avatar initial)
- **Product** — Name and requested quantity
- **Route** — Source branch → Destination branch
- **Time** — How long ago the request was made (e.g., "5m ago", "2h ago")
- **Description** — Optional note from the requester

### Accepting a Request

1. Click **Accept** on a pending request.
2. The system transfers the requested stock from the source to the destination branch.
3. The request is removed from the pending list.

### Declining a Request

1. Click **Decline** on a pending request.
2. The request is rejected and removed from the list.
3. The requester is notified (via the request status change)."""),

            # --- 10. Settings ---
            ManualSection(role="owner", parent_id=None, sort_order=10, title="Settings",
                content="""Manage your account and system preferences. Access it via **Settings** in the sidebar.

### Account Information

- **Username** — Read-only, displayed for reference.
- **Role** — Read-only, shows your current role.
- **Email** — Update your email address.
- **Phone** — Update your phone number (Philippine format: 63+ without the leading 0).

Click **Save Profile** to apply changes.

### Changing Password

1. Go to the **Change Password** tab.
2. Enter your **Old Password** — it is verified against the server on blur.
3. Enter a **New Password** that meets the requirements:
   - Minimum 6 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one special character
   - At least one number
4. **Confirm** the new password.
5. Click **Change Password**.

If you forget your password, click the **Forgot Password?** link to receive a reset link via email.

### Personalization

**Theme:**
- Choose **Light** (default) or **Dark** mode.
- The change applies immediately across all pages.

**Font Size:**
- Options: Small (12px), Medium (14px, default), Large (16px), Extra Large (32px).
- Affects all text throughout the system.

Click **Save Preferences** to persist your choices."""),
    ]

    db.session.add_all(owner_sections)
    db.session.commit()
    print(f"  Manual Sections: {len(owner_sections)}")


def seed_manager_manual():
    print("Seeding Manager Manual...")
    if ManualSection.query.filter_by(role="manager").first():
        print("[OK] Manager manual already exists. Skipping.")
        return
    sections = [
        ManualSection(role="manager", parent_id=None, sort_order=1, title="Getting Started",
            content="""### System Overview

Manco (MCM) Trading is a full-featured inventory, stock, and sales management system. As a **Manager**, you have read and update access to your assigned branch. You can view data, edit existing records, and process sales, but you cannot create or delete products or manage other users.

### Logging In

1. Open your browser and navigate to the system URL.
2. Enter your **Username** and **Password** on the login page.
3. Click **Sign In**.
4. You will be redirected to the **Manager Dashboard**.

> **Tip:** If you forget your password, click the **Forgot Password?** link on the login page to receive a reset link via email.

### Dashboard Layout

After logging in, the main interface consists of four areas:

- **Sidebar** (left) — Navigation menu for your available modules. The sidebar can be collapsed using the hamburger icon at the top.
- **Topbar** (top) — Notification bell and Logout button.
- **Content Area** (center) — The main workspace where the selected module is displayed.
- **Footer** (bottom) — System copyright information.

### Your Branch Scope

As a Manager, you are assigned to a **specific branch**. All data you see is scoped to that branch:
- You can only view and edit inventory for your branch.
- Sales transactions shown are only those from your branch.
- Stock adjustments and transfers are limited to your branch.

### Permissions Summary

| Action | You Can Do? |
|---|---|
| View products & inventory | ✓ |
| Edit product details | ✓ |
| Add / Delete / Void products | ✗ |
| Create sales transactions | ✓ |
| Void transactions | ✓ |
| Adjust stock (add/remove) | ✓ |
| Transfer stock (from your branch) | ✓ |
| Request stock from storehouse | ✓ |
| Access Settings | ✓ |
| Access Reports (Store Reports only) | ✓ |
| Manage Users / Maintenance | ✗ |

### Dark Mode & Font Size

1. Go to **Settings** → **Personalization**.
2. Choose **Light** or **Dark** theme.
3. Choose your preferred **Font Size**.
4. Click **Save Preferences**."""),

        ManualSection(role="manager", parent_id=None, sort_order=2, title="Manager Dashboard",
            content="""The Manager Dashboard provides an overview of your branch's performance. It is the first page you see after logging in and is located at **Dashboard** in the sidebar.

Your branch name is displayed below the page title.

### Stat Cards

Three stat cards appear at the top:

| Card | Description |
|---|---|
| **Total Inventory Items** | Sum of all stock quantities in your branch |
| **Sales Today** | Total revenue generated at your branch today |
| **Low Stock Alerts** | Number of products in your branch below their reorder level |

Each card shows:
- The current value with an icon
- A **trend indicator** (up/down arrow with percentage change compared to last week)
- A **Navigate** button that takes you to the relevant module (Inventory, Sales, or Stock Management)

### Stock Health Bar

A horizontal bar visualizes the overall health of your branch's inventory:
- **Green** segment — Items that are adequately stocked
- **Orange** segment — Items that are low stock

### Stock Movement Chart

This 7-day composed chart shows stock activity for your branch:
- **Green bars** — Stock received (in)
- **Red bars** — Stock sold or removed (out)
- **Blue line** — 3-day moving average of stock-in

Below the chart:
- **Net change** — Total in minus total out for the week
- **Stock runway** — Estimated days until stock runs out at current outflow

### Stock by Category (Donut Chart)

A visual breakdown of your branch's inventory distribution across product categories.

### Recent Sales

A table showing the most recent sales at your branch. Click any row or the **View All** button to go to the Sales module.

### Low Stock Items

A table listing products in your branch that need attention. Items are highlighted:
- **Red row** — Out of stock (quantity = 0)
- **Orange row** — Low stock (quantity ≤ 5)

Click **View All** to go to Stock Management."""),

        ManualSection(role="manager", parent_id=None, sort_order=3, title="Inventory Management",
            content="""The Inventory module allows you to view and edit your branch's product catalog. Access it via **Inventory** in the sidebar.

> **Note:** You can **view and edit** products but cannot add new products, delete, void, or adjust stock from this module. Use Stock Management for quantity changes.

### Viewing Products

The products table displays:
- **Product Name** — Click column header to sort
- **Category** — Sorted by category name
- **Stock Quantity** — Current stock in your branch
- **Unit** — Measurement unit
- **Base Price** — Selling price in Philippine Pesos
- **Reorder Level** — Minimum stock threshold
- **Status** — Active (green) or Voided (red)

**Filters:**
- **Search** — Type a product name
- **Category Filter** — Select a category from the dropdown

### Editing a Product

1. Click **Edit** on the desired product row.
2. Modify any of the following fields:
   - **Product Name**
   - **Base Price**
   - **Unit**
   - **Reorder Level**
   - **Description**
3. Click **Save**.

> **Note:** You cannot change the product's **Category** or **SKU**.

### What You Cannot Do

The following actions are not available to Managers in Inventory:
- **Add Product** — Contact the Owner to add new products.
- **Void Product** — Only the Owner can void products.
- **Delete Product** — Only the Owner can permanently delete voided products.
- **Adjust Stock** — Use the Stock Management module for quantity changes."""),

        ManualSection(role="manager", parent_id=None, sort_order=4, title="Sales Module",
            content="""The Sales module lets you create and manage transactions for your branch. Access it via **Sales** in the sidebar.

### Sales Overview Stats

Three stat cards scoped to your branch:
- **Total Sales Today** — Revenue generated today at your branch
- **Total Sales This Month** — Revenue this month
- **Total Transactions Today** — Number of orders placed today

### Viewing Transactions

The transactions table shows only your branch's sales:
- **Transaction ID** — Unique order number
- **Date** — Order date
- **Items** — Product names (expand by clicking on items with multiple products)
- **Total Amount** — Order total in ₱
- **Payment** — Payment method and amount received
- **Status** — Completed (green) or Voided (red)
- **Actions** — View Receipt and Void buttons

**Filters:**
- **Search** — Type a transaction ID
- **Date Range** — Filter by order date
- **Status** — Show only Completed or Voided

### Creating a Sale (POS)

Click **Add Sale** to open the Point-of-Sale modal:

**Step 1 — Select Category:**
- Browse available categories displayed as cards.
- Click a category to view its products.

**Step 2 — Add Products:**
- **Quick Add** — Tap a product card to add one unit.
- **Custom Quantity** — Long-press (hold for 500ms) to open a quantity selector.
- Products in cart show a red border.

**Step 3 — Review Cart:**
The right panel shows:
- Product name and line total
- **+ / -** buttons to adjust quantities
- **Delete** button to remove items
- **Grand Total** at the bottom

**Step 4 — Process Payment:**
- Click **Confirm Order**.
- Select **Order Date** (defaults to today).
- Choose a **Payment Method** (Cash, Card, GCash, Bank Transfer).
- Enter the **Payment Amount** (must be at least the total).
- Click **Confirm Payment**.

### Receipt

After confirming, a receipt modal appears with company info, line items, VAT breakdown, and change. Click **Print Receipt** or **Close**.

### Voiding a Transaction

1. Click **Void** on the transaction row.
2. Confirm in the popup.
3. The transaction status changes to **Voided** and inventory is restored.

> **Important:** Voiding reverses stock deduction. If auto-restock was triggered during the sale, it will be noted on the receipt.

### Viewing Total Sales

Click **View Total Sales** to see an aggregated view:
- The branch is locked to your assigned location (no branch selector).
- Filter by **Date Range**.
- Each product shows Total Quantity Sold and Total Amount.
- A **Summary Row** at the bottom shows the grand total.

### Auto-Restock

When a sale drops stock below the reorder level, the system automatically transfers stock from the **Storehouse** to your branch. This is noted on the receipt."""),

        ManualSection(role="manager", parent_id=None, sort_order=5, title="Stock Management",
            content="""The Stock Management module lets you control inventory levels for your branch. Access it via **Stock Management** in the sidebar.

### Stock Overview Stats

Three cards scoped to your branch:
- **Total Items** — Sum of all inventory quantities
- **Low Stock** — Products below reorder level
- **Out of Stock** — Products with zero quantity

### Inventory Table

Shows stock levels for products in your branch with:
- **Product Name** and **SKU**
- **Quantity** — Current stock
- **Status** tag — Green (In Stock), Orange (Low Stock, ≤10), Red (Out of Stock, =0)
- **Actions** — Adjust, Transfer, Request Stock, View Details, Set Reorder

### Adjusting Stock

1. Click **Adjust** on a product row.
2. Choose **Add Stock** or **Remove Stock**.
3. Select a **Reason** (Restock, Damaged, Correction, Sample, Sales Return).
4. Enter the quantity and optional remarks.
5. Click **Save**.

### Stock Transfers

Move stock from your branch to another:
1. Click **Transfer** on a product row.
2. The **From Location** is pre-set to your branch.
3. Select the **To Location** (destination branch).
4. Enter the **Quantity** and optional **Remarks**.
5. Click **Save**.

### Requesting Stock from Storehouse

If you need more stock, submit a request to the Owner:
1. Click **Request Stock** on a product row.
2. Select the **From Location** (usually the Storehouse).
3. Enter the **Quantity** needed.
4. Add a **Description** explaining why.
5. Click **Submit**.
6. The Owner receives a notification and can Accept or Decline.
7. If accepted, the stock is automatically transferred to your branch.

### Movement History

Click **View Details** to see a product's full movement history:
- Date and time of each change
- Type (Adjustment, Transfer In, Transfer Out, Sale, Restock)
- Quantity change (+/-)
- Location and reason

### Setting Reorder Levels

1. Click **Set Reorder** on a product row.
2. Enter the new reorder level.
3. Click **Save**.
4. The product will trigger low-stock alerts when quantity drops below this level.

### What You Cannot Do

- **Bulk Restock** — This feature is only available to the Owner.
- **Restock All Below Threshold** — Owner-only."""),

        ManualSection(role="manager", parent_id=None, sort_order=6, title="Reports",
            content="""The Reports module provides data analysis and reporting tools. Access it via **Reports** in the sidebar.

### Inventory Reports

**Stock Levels by Branch:**
- Table view: Branch name, total items, total quantity.
- Chart view: Bar chart visual comparison. Toggle between table/chart with the button in the card header.

**Stock Distribution:**
- Pie chart showing the proportion of stock across branches.
- Use the **Filter by Product** dropdown to see distribution for a specific product.

**Low Stock Items:**
- Table listing all low-stock products with product name, SKU, branch, current stock, and reorder level.

### Sales Reports

- **Period Selector** — Choose 7, 30, or 90 days.
- **Stats Cards** — Total Orders, Total Revenue, Avg Order Value.
- **Daily Sales Trend** — Bar chart of revenue per day.
- **Top Products** — Table of best-selling products by quantity and revenue.

### Financial Reports

- **Period Selector** — 30, 90, or 365 days.
- **Stats Cards** — Total Revenue and Total Orders.
- **Revenue by Date** — Table with date, order count, and revenue.
- **Payment Methods** — Breakdown of transactions and amounts by payment method (Cash, Card, GCash, Bank Transfer).

### Store Reports

Create, edit, and view issue reports for your branch. The Store Reports tab has a split-pane layout:
- **Left pane** — A list of all your submitted reports.
- **Right pane** — Details of the selected report, or a form to create a new one.

**Creating a New Report:**
1. Click the **New Report** button.
2. Fill in the form: Title (required), Issue Type (required: Store Issue, Software Issue), Description (required).
3. Click **Submit**.

**Viewing a Report:**
Click any report in the left list to view its details on the right pane, including title, issue type, status, branch, description, and submission date.

**Editing a Pending Report:**
1. Select the report in the left list.
2. Click **Edit** in the right pane.
3. Update the title, issue type, or description.
4. Click **Update**.

**Voiding a Report:**
1. Select the report you want to void.
2. Click **Void**.
3. Confirm the action. The report status changes to **voided**.

**Marking a Report as Resolved:**
If the issue is resolved, you can mark it yourself:
1. Select the report.
2. Click **Mark Resolved**.
3. The status changes to **resolved** with a timestamp.

**Status Colors:**
- **Pending** — Orange. The report is awaiting action.
- **Resolved** — Green. The issue has been addressed.
- **Voided** — Red. The report was cancelled."""),

        ManualSection(role="manager", parent_id=None, sort_order=7, title="Settings",
            content="""Manage your account and preferences. Access it via **Settings** in the sidebar.

### Account Information

- **Username** — Read-only, for reference.
- **Role** — Read-only, shows **Manager**.
- **Email** — Update your email address.
- **Phone** — Update your phone number (Philippine format: 63+ without leading 0).

Click **Save Profile** to apply changes.

### Changing Password

1. Go to the **Change Password** tab.
2. Enter your **Old Password** — verified on blur.
3. Enter a **New Password** meeting requirements:
   - Minimum 6 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one special character
   - At least one number
4. **Confirm** the new password.
5. Click **Change Password**.

Forgot your password? Click **Forgot Password?** to receive a reset link via email.

### Personalization

**Theme:**
- Choose **Light** (default) or **Dark** mode.
- Changes apply immediately.

**Font Size:**
- Options: Small (12px), Medium (14px, default), Large (16px), Extra Large (32px).

Click **Save Preferences** to persist your choices."""),
    ]
    db.session.add_all(sections)
    db.session.commit()
    print(f"  Manager Manual Sections: {len(sections)}")


def seed_admin_manual():
    print("Seeding Admin Manual...")
    if ManualSection.query.filter_by(role="admin").first():
        print("[OK] Admin manual already exists. Skipping.")
        return
    sections = [
        ManualSection(role="admin", parent_id=None, sort_order=1, title="Getting Started",
            content="""### System Overview

Manco (MCM) Trading is a full-featured inventory, stock, and sales management system. As an **Admin**, you have full create, read, update, and delete permissions on the modules you can access. Your focus is on system administration, maintenance, and reporting.

### Logging In

1. Open your browser and navigate to the system URL.
2. Enter your **Username** and **Password** on the login page.
3. Click **Sign In**.
4. You will be redirected to the **Admin Dashboard**.

> **Tip:** If you forget your password, click the **Forgot Password?** link on the login page.

### Dashboard Layout

After logging in:
- **Sidebar** — Navigation for your available modules (Dashboard, Maintenance, Reports, Settings, Help, About).
- **Topbar** — Notification bell and Logout button.
- **Content Area** — The main workspace.

### Modules You Can Access

| Module | Purpose |
|---|---|
| **Dashboard** | System overview and configuration |
| **Maintenance** | Database backups, integrity checks, optimization, cleanup |
| **Reports** | Activity reports, store reports, system reports |
| **Settings** | Profile, password, personalization |

### Modules You Cannot Access

The following modules are **not available** to Admins:
- **Inventory** — Product and stock management (Owner/Manager only)
- **Sales** — Transaction processing (Owner/Manager only)
- **Stock Management** — Stock adjustments and transfers (Owner/Manager only)
- **User Access** — User role management (Owner only)

### Dark Mode & Font Size

1. Go to **Settings** → **Personalization**.
2. Choose **Light** or **Dark** theme.
3. Choose your preferred **Font Size**.
4. Click **Save Preferences**."""),

        ManualSection(role="admin", parent_id=None, sort_order=2, title="Admin Dashboard",
            content="""The Admin Dashboard provides a system-level overview. Access it via **Dashboard** in the sidebar.

### Stat Cards

Four stat cards at the top:
- **Total Users** — Number of registered user accounts
- **Inventory Items** — Total stock quantity across all branches
- **7-Day Activity** — Number of system actions logged in the last 7 days
- **System Status** — Always shows "Operational" when the system is running

### System Configuration Panel

Below the stat cards, a detailed descriptions panel shows:
- **Total Registered Users**
- **Database Status** — Tag showing "Connected" (green)
- **Active Inventory Items** — Total items across all branches
- **Low Stock Alerts** — Count with color tag (orange if > 0)
- **7-Day Activity Logs** — Total actions logged
- **Sales Today** — Total revenue across all branches"""),

        ManualSection(role="admin", parent_id=None, sort_order=3, title="System Maintenance",
            content="""The Maintenance module provides database administration tools. Access it via **Maintenance** in the sidebar.

### System Information

View key database metrics:
- **Database Size** — Current size on disk
- **SQLite Version** — Database engine version
- **Backups** — Number of existing backups
- **Application** — App name and version
- **Table Records** — Count of records in each database table

### Backup & Restore

**Create Backup:**
1. Go to the **Backup & Restore** tab.
2. Click **Create Backup**.
3. The system creates a JSON dump of all tables.
4. The backup appears in the list with filename, size, and timestamp.

**Restore from Backup:**
1. Find the backup file in the list.
2. Click **Restore**.
3. Confirm. **This will replace the current database** with the backup.

**Delete Backup:**
1. Click **Delete** on a backup file.
2. Confirm to permanently remove it.

### Integrity Check

1. Go to the **Maintenance** tab.
2. Click **Run Integrity Check**.
3. Results show passed/failed status, FK violation count, and any issues found.

### Database Optimization

**VACUUM Database:**
- Reclaims unused space in the database file.
- Shows size before, size after, space saved, and duration.

**REINDEX:**
- Rebuilds all database indexes for better query performance.

### Data Cleanup

1. Go to the **Cleanup** tab.
2. Set the **Retention Period** in days (default: 90).
3. Select categories to clean:
   - **Purge old activity logs**
   - **Permanently delete voided products**
   - **Clean old / cancelled transfers**
4. Click **Run Cleanup** and confirm.
5. Results show how many records were deleted per category."""),

        ManualSection(role="admin", parent_id=None, sort_order=4, title="Reports",
            content="""The Reports module gives you access to activity monitoring and system information. Access it via **Reports** in the sidebar.

### Activity Reports

View user and module activity for a selected period (7, 30, or 90 days):

**Stats Cards:**
- **Total Actions** — Number of actions logged
- **Unique Users** — Distinct users who performed actions

**Per-User Activity:**
- A table showing each user's username and the number of actions they performed.

**Per-Module Activity:**
- A table showing each module name and the number of actions logged in it.

**Store Reports (embedded in Activity tab):**

This section lets you manage issue reports submitted by managers and owners:
- Browse all reports in a table with user, branch, issue type, status, and date.
- **View** any report by clicking the eye icon.
- **Resolve** pending reports by clicking the Resolve button (records who resolved it and when).
- Only the report creator can **Edit** or **Void** their own pending reports.

**Issue Types:**
- **Store Issue** — Problems related to the physical store.
- **Software Issue** — Problems with the system software.

**Status Lifecycle:**
- **Pending** (orange) → **Resolved** (green) by clicking Resolve
- **Pending** → **Voided** (red) by the creator

### System Reports

View system-level information:
- **Stats Cards** — Backups count, 7-day activity, 30-day activity
- **Backup History** — Table listing all backup files with filename, size, and creation date"""),

        ManualSection(role="admin", parent_id=None, sort_order=5, title="Settings",
            content="""Manage your account and preferences. Access it via **Settings** in the sidebar.

### Account Information

- **Username** — Read-only, for reference.
- **Role** — Read-only, shows **Admin**.
- **Email** — Update your email address.
- **Phone** — Update your phone number (63+ format).

Click **Save Profile** to apply changes.

### Changing Password

1. Go to the **Change Password** tab.
2. Enter your **Old Password** — verified on blur.
3. Enter a **New Password** meeting requirements:
   - Minimum 6 characters
   - At least one uppercase letter
   - At least one lowercase letter
   - At least one special character
   - At least one number
4. **Confirm** the new password.
5. Click **Change Password**.

### Personalization

**Theme:**
- Choose **Light** (default) or **Dark** mode.
- Changes apply immediately.

**Font Size:**
- Options: Small (12px), Medium (14px, default), Large (16px), Extra Large (32px).

Click **Save Preferences** to persist your choices."""),
    ]
    db.session.add_all(sections)
    db.session.commit()
    print(f"  Admin Manual Sections: {len(sections)}")


def seed_missing_models(locs, users, all_products):
    now = datetime.now()
    seeded_any = False

    if StockRequest.query.count() == 0:
        print("  Seeding StockRequest...")
        branch_users = [u for u in users if u.usertype == 2]
        sreq_statuses = ["pending", "approved", "declined"]
        for _ in range(SEED_STOCK_REQUESTS):
            branch_loc = random.choice(locs[1:])
            requester = random.choice(branch_users) if branch_users else random.choice(users)
            status = random.choice(sreq_statuses)
            created = now - timedelta(days=random.randint(0, 60), hours=random.randint(0, 23))
            db.session.add(StockRequest(
                product_id=random.choice(all_products).product_id,
                from_location_id=locs[0].location_id,
                to_location_id=branch_loc.location_id,
                requested_by=requester.user_id,
                quantity=random.randint(5, 30),
                description=random.choice([
                    "Running low on stock", "Customer demand increased",
                    "Seasonal restock needed", "Urgent: nearly out of stock",
                ]),
                status=status, created_at=created, updated_at=created,
            ))
        db.session.flush()
        seeded_any = True

    if StoreReport.query.count() == 0:
        print("  Seeding StoreReport...")
        issue_types = ["store", "materials", "software"]
        report_statuses = ["pending", "resolved", "voided"]
        report_titles = [
            "Broken shelf in storage area", "Air conditioning not working",
            "Fabric delivery damaged", "Wrong thread colors received",
            "POS system slow during peak hours", "Lighting fixture needs replacement",
            "Water leak near storage room", "Inventory count mismatch on trims",
            "Scanner not reading barcodes", "Safety hazard on cutting table",
        ]
        for _ in range(SEED_STORE_REPORTS):
            loc = random.choice(locs)
            reporter = random.choice(users)
            status = random.choice(report_statuses)
            resolved_by_user = random.choice(users).user_id if status == "resolved" else None
            resolved_at = now - timedelta(days=random.randint(1, 30)) if resolved_by_user else None
            db.session.add(StoreReport(
                user_id=reporter.user_id, location_id=loc.location_id,
                title=random.choice(report_titles), issue_type=random.choice(issue_types),
                description=f"Reported issue at {loc.name}. Needs attention from the team.",
                status=status, resolved_by=resolved_by_user, resolved_at=resolved_at,
                created_at=now - timedelta(days=random.randint(0, 60), hours=random.randint(0, 23)),
            ))
        db.session.flush()
        seeded_any = True

    return seeded_any


def seed_if_empty():
    app = create_app()
    with app.app_context():
        existing = db.session.query(User.user_id).limit(1).first()
        if existing:
            print("[OK] Remote DB already has data. Checking for missing tables...")
            locs = Location.query.all()
            users = User.query.all()
            all_products = Product.query.all()
            seeded = seed_missing_models(locs, users, all_products)
            if seeded:
                db.session.commit()
            seed_manual_sections()
            seed_manager_manual()
            seed_admin_manual()
            return

    print("[OK] Remote DB empty. Seeding without dropping tables.")
    seed(skip_drop=True)


if __name__ == "__main__":
    if IF_EMPTY:
        seed_if_empty()
    elif DB_MODE == "remote" or FORCE:
        seed(skip_drop=False)
    else:
        seed()
