import random
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash
from models import db, User, Location, PasswordResetToken, PasswordResetRequest

auth_bp = Blueprint("auth", __name__)

ROLE_MAP = {1: "owner", 2: "manager", 3: "admin"}


@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    username = data.get("username", "").strip()
    password = data.get("password", "")

    if not username or not password:
        return jsonify({"error": "Username and password are required"}), 400

    user = User.query.filter(
        (User.username == username) | (User.email == username)
    ).first()

    if not user or not check_password_hash(user.password, password):
        return jsonify({"error": "Invalid username or password"}), 401

    location = Location.query.get(user.location_id) if user.location_id else None

    return jsonify({
        "user_id": user.user_id,
        "username": user.username,
        "email": user.email,
        "role": ROLE_MAP.get(user.usertype, "admin"),
        "usertype": user.usertype,
        "location_id": user.location_id,
        "location_name": location.name if location else None,
        "is_storehouse": location.is_storehouse if location else False,
    })


@auth_bp.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    username = data.get("username", "").strip()
    email = data.get("email", "").strip()
    password = data.get("password", "")

    if not username or not email or not password:
        return jsonify({"error": "Username, email, and password are required"}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "Username already exists"}), 409

    if User.query.filter_by(email=email).first():
        return jsonify({"error": "Email already registered"}), 409

    user = User(
        username=username,
        email=email,
        password=generate_password_hash(password),
        usertype=data.get("usertype", 3),
        phone=data.get("phone"),
        location_id=data.get("location_id", 0),
        employee_code=str(random.randint(100000000, 999999999)),
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({
        "message": "Registration successful",
        "user_id": user.user_id,
        "username": user.username,
        "email": user.email,
        "role": ROLE_MAP.get(user.usertype, "admin"),
    }), 201


@auth_bp.route("/api/auth/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    username = data.get("username", "").strip()
    if not username:
        return jsonify({"error": "Username is required"}), 400

    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"message": "If the username exists, a reset request will be sent to an admin"}), 200

    note = data.get("note", "").strip() or None

    PasswordResetRequest.query.filter_by(user_id=user.user_id, status="pending").update(
        {"status": "replaced"}
    )

    req = PasswordResetRequest(
        user_id=user.user_id,
        requester_note=note,
        status="pending",
    )
    db.session.add(req)
    db.session.commit()

    return jsonify({"message": "If the username exists, a reset request will be sent to an admin"}), 200


@auth_bp.route("/api/auth/reset-requests", methods=["GET"])
def list_reset_requests():
    usertype = request.args.get("usertype", type=int)
    if not usertype or usertype not in (1, 3):
        return jsonify({"error": "Unauthorized"}), 403

    requests_list = (
        PasswordResetRequest.query
        .join(User, PasswordResetRequest.user_id == User.user_id)
        .join(Location, User.location_id == Location.location_id, isouter=True)
        .filter(PasswordResetRequest.status.in_(["pending"]))
        .order_by(PasswordResetRequest.created_at.desc())
        .all()
    )

    approved_list = (
        PasswordResetRequest.query
        .join(User, PasswordResetRequest.user_id == User.user_id)
        .filter(
            PasswordResetRequest.status == "approved",
            PasswordResetRequest.expires_at > datetime.now(),
        )
        .order_by(PasswordResetRequest.approved_at.desc())
        .all()
    )

    all_requests = requests_list + approved_list

    def serialize(r):
        return {
            "request_id": r.request_id,
            "user_id": r.user.user_id,
            "username": r.user.username,
            "location_name": r.user.location.name if hasattr(r.user, 'location') and r.user.location else None,
            "requester_note": r.requester_note,
            "reset_code": r.reset_code if r.status == "approved" else None,
            "status": r.status,
            "approved_by": r.approved_by,
            "approved_at": r.approved_at.isoformat() if r.approved_at else None,
            "expires_at": r.expires_at.isoformat() if r.expires_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }

    return jsonify({"success": True, "data": [serialize(r) for r in all_requests]}), 200


@auth_bp.route("/api/auth/reset-requests/count", methods=["GET"])
def count_reset_requests():
    usertype = request.args.get("usertype", type=int)
    if not usertype or usertype not in (1, 3):
        return jsonify({"success": True, "count": 0}), 200

    count = PasswordResetRequest.query.filter_by(status="pending").count()
    return jsonify({"success": True, "count": count}), 200


@auth_bp.route("/api/auth/reset-requests/<int:request_id>/approve", methods=["POST"])
def approve_reset_request(request_id):
    usertype = request.args.get("usertype", type=int)
    approved_by = request.args.get("approved_by", type=int)
    if not usertype or usertype not in (1, 3):
        return jsonify({"error": "Unauthorized"}), 403

    reset_req = PasswordResetRequest.query.get(request_id)
    if not reset_req:
        return jsonify({"error": "Request not found"}), 404

    if reset_req.status != "pending":
        return jsonify({"error": f"Request is already {reset_req.status}"}), 400

    code = "".join([str(random.randint(0, 9)) for _ in range(6)])
    reset_req.reset_code = code
    reset_req.status = "approved"
    reset_req.approved_by = approved_by
    reset_req.approved_at = datetime.now()
    reset_req.expires_at = datetime.now() + timedelta(hours=24)
    db.session.commit()

    return jsonify({
        "success": True,
        "data": {
            "request_id": reset_req.request_id,
            "reset_code": code,
            "username": reset_req.user.username,
            "expires_at": reset_req.expires_at.isoformat(),
        },
    }), 200


@auth_bp.route("/api/auth/reset-requests/<int:request_id>/decline", methods=["POST"])
def decline_reset_request(request_id):
    usertype = request.args.get("usertype", type=int)
    if not usertype or usertype not in (1, 3):
        return jsonify({"error": "Unauthorized"}), 403

    reset_req = PasswordResetRequest.query.get(request_id)
    if not reset_req:
        return jsonify({"error": "Request not found"}), 404

    if reset_req.status != "pending":
        return jsonify({"error": f"Request is already {reset_req.status}"}), 400

    reset_req.status = "declined"
    db.session.commit()

    return jsonify({"success": True, "message": "Request declined"}), 200


@auth_bp.route("/api/auth/reset-with-code", methods=["POST"])
def reset_with_code():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400

    code = (data.get("reset_code") or "").strip()
    new_password = data.get("new_password")

    if not code or not new_password:
        return jsonify({"error": "Reset code and new password are required"}), 400

    reset_req = PasswordResetRequest.query.filter_by(
        reset_code=code, status="approved"
    ).first()

    if not reset_req:
        return jsonify({"error": "Invalid reset code"}), 400

    if reset_req.expires_at and reset_req.expires_at < datetime.now():
        reset_req.status = "expired"
        db.session.commit()
        return jsonify({"error": "Reset code has expired"}), 400

    user = User.query.get(reset_req.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    user.password = generate_password_hash(new_password)
    reset_req.status = "used"
    db.session.commit()

    return jsonify({"message": "Password reset successfully"}), 200


@auth_bp.route("/api/auth/reset/<token>", methods=["GET"])
def verify_reset_token(token):
    reset_token = PasswordResetToken.query.filter_by(token=token, used=False).first()
    
    if not reset_token:
        return jsonify({"error": "Invalid or expired token"}), 400
    
    if reset_token.expires_at < datetime.now():
        return jsonify({"error": "Token has expired"}), 400
    
    return jsonify({"valid": True, "message": "Token is valid"}), 200


@auth_bp.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body is required"}), 400
    
    token = data.get("token")
    new_password = data.get("new_password")
    
    if not token or not new_password:
        return jsonify({"error": "Token and new password are required"}), 400
    
    reset_token = PasswordResetToken.query.filter_by(token=token, used=False).first()
    
    if not reset_token:
        return jsonify({"error": "Invalid or expired token"}), 400
    
    if reset_token.expires_at < datetime.now():
        return jsonify({"error": "Token has expired"}), 400
    
    user = User.query.get(reset_token.user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    user.password = generate_password_hash(new_password)
    reset_token.used = True
    db.session.commit()
    
    return jsonify({"message": "Password reset successfully"}), 200
