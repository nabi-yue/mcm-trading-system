"""Run once to apply schema migrations. Not needed on every cold start."""
import os
import sys
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

from app import create_app

app = create_app()

with app.app_context():
    import sqlalchemy as sa
    from models import db

    inspector = sa.inspect(db.engine)
    tables = inspector.get_table_names()
    print(f"Existing tables: {tables}")

    # Ensure base tables exist
    if 'Product_Varieties' not in tables or 'Notifications' not in tables or 'Password_Reset_Requests' not in tables:
        db.create_all()
        db.session.commit()
        print("Created missing tables")

    # Add missing columns
    migrations = [
        ('Locations', 'auto_restock_source_id', 'INTEGER REFERENCES "Locations"(location_id)'),
        ('Products', 'auto_restock_source_id', 'INTEGER REFERENCES "Locations"(location_id)'),
        ('Users', 'theme', "VARCHAR DEFAULT 'light'"),
        ('Users', 'fontsize', "VARCHAR DEFAULT 'medium'"),
        ('Users', 'is_active', 'BOOLEAN DEFAULT TRUE'),
        ('Inventory', 'variety_id', 'INTEGER REFERENCES "Product_Varieties"(variety_id)'),
        ('Order_Items', 'variety_id', 'INTEGER REFERENCES "Product_Varieties"(variety_id)'),
        ('Stock_Transfers', 'variety_id', 'INTEGER REFERENCES "Product_Varieties"(variety_id)'),
        ('Stock_Adjustments', 'variety_id', 'INTEGER REFERENCES "Product_Varieties"(variety_id)'),
        ('Stock_Requests', 'variety_id', 'INTEGER REFERENCES "Product_Varieties"(variety_id)'),
    ]

    for table_name, col_name, col_def in migrations:
        if table_name in tables:
            existing = [c['name'] for c in inspector.get_columns(table_name)]
            if col_name not in existing:
                db.session.execute(sa.text(f'ALTER TABLE "{table_name}" ADD COLUMN {col_name} {col_def}'))
                db.session.commit()
                print(f"Added {col_name} to {table_name}")
            else:
                print(f"Column {col_name} already exists in {table_name}")

    print("Migrations complete")
