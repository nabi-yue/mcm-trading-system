from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "Users"
    user_id = db.Column(db.Integer, primary_key=True)
    usertype = db.Column(db.Integer, nullable=False)
    username = db.Column(db.String, nullable=False)
    email = db.Column(db.String, nullable=False, unique=True)
    phone = db.Column(db.String, nullable=True)
    password = db.Column(db.String, nullable=False)
    location_id = db.Column(db.Integer, nullable=False, default=0)
    employee_code = db.Column(db.String, nullable=False, unique=True)
    is_active = db.Column(db.Boolean, default=True)
    theme = db.Column(db.String, default= "light")
    fontsize = db.Column(db.String, default= "medium") 
    # profile_picture = db.Column(db.String, nullable=True)


class PasswordResetToken(db.Model):
    __tablename__ = "Password_Reset_Tokens"
    token_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("Users.user_id"), nullable=False)
    token = db.Column(db.String, nullable=False, unique=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used = db.Column(db.Boolean, default=False)
    user = db.relationship("User", backref="reset_tokens")


class PasswordResetRequest(db.Model):
    __tablename__ = "Password_Reset_Requests"
    request_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("Users.user_id"), nullable=False)
    requester_note = db.Column(db.Text, nullable=True)
    reset_code = db.Column(db.String(6), nullable=True)
    status = db.Column(db.String(16), nullable=False, default="pending")
    approved_by = db.Column(db.Integer, db.ForeignKey("Users.user_id"), nullable=True)
    approved_at = db.Column(db.DateTime, nullable=True)
    expires_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    user = db.relationship("User", foreign_keys=[user_id], backref="password_reset_requests")
    approver = db.relationship("User", foreign_keys=[approved_by])



class Location(db.Model):
    __tablename__ = "Locations"
    location_id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String, nullable=False)
    address = db.Column(db.String)
    is_active = db.Column(db.Boolean, default=True)
    is_storehouse = db.Column(db.Boolean, default=False)
    auto_restock_source_id = db.Column(db.Integer, db.ForeignKey("Locations.location_id"), nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, onupdate=datetime.now)


class Category(db.Model):
    __tablename__ = "Categories"
    category_id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String, nullable=False)
    description = db.Column(db.String)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, onupdate=datetime.now)


class Product(db.Model):
    __tablename__ = "Products"
    product_id = db.Column(db.Integer, primary_key=True)
    category_id = db.Column(db.Integer, db.ForeignKey("Categories.category_id"), nullable=False)
    name = db.Column(db.String, nullable=False)
    price = db.Column(db.Integer, nullable=False)
    reorder_level = db.Column(db.String)
    auto_restock_source_id = db.Column(db.Integer, db.ForeignKey("Locations.location_id"), nullable=True)
    description = db.Column(db.Text)
    sku = db.Column(db.String, unique=True)
    unit = db.Column(db.String)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.now)
    updated_at = db.Column(db.DateTime, onupdate=datetime.now)
    category = db.relationship("Category", backref="products")


class ProductVariety(db.Model):
    __tablename__ = "Product_Varieties"
    variety_id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("Products.product_id"), nullable=False)
    variety_sku = db.Column(db.String, unique=True, nullable=False)
    color = db.Column(db.String, nullable=True)
    pattern = db.Column(db.String, nullable=True)
    product = db.relationship("Product", backref="varieties")


class Order(db.Model):
    __tablename__ = "Orders"
    order_id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.Integer, db.ForeignKey("Locations.location_id"), nullable=False)
    order_date = db.Column(db.DateTime, nullable=False, default=datetime.now)
    status = db.Column(db.String, nullable=False)
    total_amount = db.Column(db.Float, nullable=False)
    location = db.relationship("Location", backref="orders")


class OrderItem(db.Model):
    __tablename__ = "Order_Items"
    order_item_id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("Orders.order_id"), nullable=False)
    product_id = db.Column(db.Integer, db.ForeignKey("Products.product_id"), nullable=False)
    variety_id = db.Column(db.Integer, db.ForeignKey("Product_Varieties.variety_id"), nullable=True)
    quantity = db.Column(db.Float, nullable=False)
    price = db.Column(db.Integer, nullable=False)
    order = db.relationship("Order", backref="items")
    product = db.relationship("Product")
    variety = db.relationship("ProductVariety")


class Payment(db.Model):
    __tablename__ = "Payments"
    payment_id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("Orders.order_id"), nullable=False)
    payment_method = db.Column(db.String, nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    price = db.Column(db.Integer, nullable=False)
    order = db.relationship("Order", backref="payments")


class Inventory(db.Model):
    __tablename__ = "Inventory"
    inventory_id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("Products.product_id"), nullable=False)
    variety_id = db.Column(db.Integer, db.ForeignKey("Product_Varieties.variety_id"), nullable=True)
    location_id = db.Column(db.Integer, db.ForeignKey("Locations.location_id"), nullable=False)
    quantity = db.Column(db.Float, nullable=False, default=0.0)
    updated_at = db.Column(db.DateTime, onupdate=datetime.now)
    product = db.relationship("Product")
    location = db.relationship("Location")
    variety = db.relationship("ProductVariety")


class StockTransfer(db.Model):
    __tablename__ = "Stock_Transfers"
    transfer_id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("Products.product_id"), nullable=False)
    variety_id = db.Column(db.Integer, db.ForeignKey("Product_Varieties.variety_id"), nullable=True)
    from_location_id = db.Column(db.Integer, db.ForeignKey("Locations.location_id"), nullable=False)
    to_location_id = db.Column(db.Integer, db.ForeignKey("Locations.location_id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("Users.user_id"), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    transfer_date = db.Column(db.DateTime, nullable=False, default=datetime.now)
    status = db.Column(db.String, nullable=False, default="completed")
    remarks = db.Column(db.String)
    product = db.relationship("Product")
    variety = db.relationship("ProductVariety")
    from_location = db.relationship("Location", foreign_keys=[from_location_id])
    to_location = db.relationship("Location", foreign_keys=[to_location_id])
    user = db.relationship("User")


class StockAdjustment(db.Model):
    __tablename__ = "Stock_Adjustments"
    adjustment_id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("Products.product_id"), nullable=False)
    variety_id = db.Column(db.Integer, db.ForeignKey("Product_Varieties.variety_id"), nullable=True)
    location_id = db.Column(db.Integer, db.ForeignKey("Locations.location_id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("Users.user_id"), nullable=False)
    quantity_change = db.Column(db.Float, nullable=False)
    reason = db.Column(db.String)
    date = db.Column(db.DateTime, nullable=False, default=datetime.now)
    product = db.relationship("Product")
    variety = db.relationship("ProductVariety")
    location = db.relationship("Location")
    user = db.relationship("User")


class ActivityLog(db.Model):
    __tablename__ = "Activity_Log"
    log_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("Users.user_id"), nullable=False)
    module = db.Column(db.String, nullable=False)
    action_type = db.Column(db.String, nullable=False)
    action = db.Column(db.String, nullable=False)
    details = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.now)
    user = db.relationship("User")


class StockRequest(db.Model):
    __tablename__ = "Stock_Requests"
    request_id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.Integer, db.ForeignKey("Products.product_id"), nullable=False)
    variety_id = db.Column(db.Integer, db.ForeignKey("Product_Varieties.variety_id"), nullable=True)
    from_location_id = db.Column(db.Integer, db.ForeignKey("Locations.location_id"), nullable=False)
    to_location_id = db.Column(db.Integer, db.ForeignKey("Locations.location_id"), nullable=False)
    requested_by = db.Column(db.Integer, db.ForeignKey("Users.user_id"), nullable=False)
    quantity = db.Column(db.Float, nullable=False)
    description = db.Column(db.String)
    status = db.Column(db.String, nullable=False, default="pending")
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    updated_at = db.Column(db.DateTime, onupdate=datetime.now)
    product = db.relationship("Product")
    variety = db.relationship("ProductVariety")
    from_location = db.relationship("Location", foreign_keys=[from_location_id])
    to_location = db.relationship("Location", foreign_keys=[to_location_id])
    requester = db.relationship("User", foreign_keys=[requested_by])


class StoreReport(db.Model):
    __tablename__ = "Store_Reports"
    report_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("Users.user_id"), nullable=False)
    location_id = db.Column(db.Integer, db.ForeignKey("Locations.location_id"), nullable=False)
    title = db.Column(db.String, nullable=False)
    issue_type = db.Column(db.String, nullable=False)  # store, materials, software
    description = db.Column(db.Text, nullable=False)
    status = db.Column(db.String, nullable=False, default="pending")  # pending, resolved, voided
    resolved_by = db.Column(db.Integer, db.ForeignKey("Users.user_id"), nullable=True)
    resolved_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    updated_at = db.Column(db.DateTime, onupdate=datetime.now)
    user = db.relationship("User", foreign_keys=[user_id])
    location = db.relationship("Location")
    resolver = db.relationship("User", foreign_keys=[resolved_by])


class Notification(db.Model):
    __tablename__ = "Notifications"
    notification_id = db.Column(db.Integer, primary_key=True)
    location_id = db.Column(db.Integer, db.ForeignKey("Locations.location_id"), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    message = db.Column(db.Text, nullable=False)
    request_id = db.Column(db.Integer, db.ForeignKey("Stock_Requests.request_id"), nullable=True)
    is_read = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.now)
    location = db.relationship("Location")


class ManualSection(db.Model):
    __tablename__ = "Manual_Sections"
    section_id = db.Column(db.Integer, primary_key=True)
    role = db.Column(db.String(16), nullable=False)
    parent_id = db.Column(db.Integer, db.ForeignKey("Manual_Sections.section_id"), nullable=True)
    sort_order = db.Column(db.Integer, nullable=False, default=0)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, nullable=False, default="")
    children = db.relationship("ManualSection", backref=db.backref("parent", remote_side=[section_id]), lazy="joined", join_depth=1)
