from flask import Blueprint, jsonify, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required

from ..extensions import db
from ..models.user import User

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/bootstrap")
def bootstrap_admin():
    """
    Crea el primer admin si no existe ninguno.
    Body: { "username": "...", "password": "..." }
    """
    if User.query.count() > 0:
        return jsonify({"error": "already_bootstrapped"}), 409

    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"error": "username_and_password_required"}), 400

    user = User(username=username, role="ADMIN", is_active=True)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({"id": user.id, "username": user.username, "role": user.role})


@bp.post("/login")
def login():
    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""

    user = User.query.filter_by(username=username).first()
    if not user or not user.is_active or not user.check_password(password):
        return jsonify({"error": "invalid_credentials"}), 401

    token = create_access_token(identity=str(user.id))
    return jsonify({"access_token": token})


@bp.get("/me")
@jwt_required()
def me():
    user_id = get_jwt_identity()
    user = User.query.get(int(user_id))
    if not user:
        return jsonify({"error": "not_found"}), 404
    return jsonify({
        "id": user.id,
        "username": user.username,
        "role": user.role,
        "client_id": getattr(user, "client_id", None),
    })

