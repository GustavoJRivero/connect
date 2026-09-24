"""ABM de usuarios del panel y de roles con sus permisos."""

from flask import Blueprint, jsonify, request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from ..acl import ACTION_LABELS, MODULES, MODULE_ACTIONS, current_staff_user
from ..extensions import db
from ..models.auth_security import LoginChallenge, StaffTrustedIp
from ..models.role import Role
from ..models.user import User
from .auth import MIN_PASSWORD_LENGTH, normalize_email, user_to_dict, valid_email

bp = Blueprint("users", __name__, url_prefix="/api/users")
roles_bp = Blueprint("roles", __name__, url_prefix="/api/roles")


def _error(code: str, message: str, status: int = 400):
    return jsonify({"error": code, "message": message}), status


def _require_admin():
    user = current_staff_user()
    if user is None or not user.is_admin:
        return _error("admin_required", "Solo un administrador puede realizar esta acción.", 403)
    return None


def _active_admins_excluding(user_id: int) -> int:
    return (
        User.query.join(Role, User.role_id == Role.id)
        .filter(Role.is_admin.is_(True), User.is_active.is_(True), User.id != user_id)
        .count()
    )


def _validate_email(email: str, user_id: int | None = None):
    if not email:
        return None
    if not valid_email(email):
        return _error("invalid_email", "El email no es válido.")
    q = User.query.filter(func.lower(User.email) == email)
    if user_id is not None:
        q = q.filter(User.id != user_id)
    if q.first():
        return _error("email_taken", "Ese email ya lo usa otro usuario.", 409)
    return None


# ─────────────────────────────────────────────
# Usuarios
# ─────────────────────────────────────────────

@bp.get("")
def list_users():
    users = User.query.order_by(User.username.asc()).all()
    return jsonify([user_to_dict(u) for u in users])


@bp.post("")
def create_user():
    denied = _require_admin()
    if denied:
        return denied
    data = request.get_json(force=True) or {}
    username = (data.get("username") or "").strip()
    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    email = normalize_email(data.get("email"))
    password = data.get("password") or ""
    role = Role.query.get(int(data.get("role_id") or 0))

    if not username:
        return _error("username_required", "Completá el nombre de usuario.")
    if User.query.filter_by(username=username).first():
        return _error("username_taken", "Ese nombre de usuario ya existe.", 409)
    if not first_name or not last_name:
        return _error("name_required", "Completá el nombre y el apellido.")
    if not email:
        return _error("email_required", "El email es obligatorio: ahí llega el código de ingreso.")
    err = _validate_email(email)
    if err:
        return err
    if len(password) < MIN_PASSWORD_LENGTH:
        return _error("weak_password", f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.")
    if not role:
        return _error("role_required", "Elegí un rol.")

    user = User(
        username=username,
        first_name=first_name[:80],
        last_name=last_name[:80],
        email=email,
        role="ADMIN" if role.is_admin else "OPERATOR",
        role_id=role.id,
        is_active=bool(data.get("is_active", True)),
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify(user_to_dict(user)), 201


@bp.put("/<int:user_id>")
def update_user(user_id: int):
    denied = _require_admin()
    if denied:
        return denied
    user = User.query.get_or_404(user_id)
    me = current_staff_user()
    data = request.get_json(force=True) or {}

    if "username" in data:
        username = (data.get("username") or "").strip()
        if not username:
            return _error("username_required", "Completá el nombre de usuario.")
        if User.query.filter(User.username == username, User.id != user.id).first():
            return _error("username_taken", "Ese nombre de usuario ya existe.", 409)
        user.username = username

    if "first_name" in data or "last_name" in data:
        first_name = (data.get("first_name") if "first_name" in data else user.first_name) or ""
        last_name = (data.get("last_name") if "last_name" in data else user.last_name) or ""
        first_name, last_name = first_name.strip(), last_name.strip()
        if not first_name or not last_name:
            return _error("name_required", "Completá el nombre y el apellido.")
        user.first_name = first_name[:80]
        user.last_name = last_name[:80]

    if "email" in data:
        email = normalize_email(data.get("email"))
        if not email:
            return _error("email_required", "El email es obligatorio: ahí llega el código de ingreso.")
        err = _validate_email(email, user.id)
        if err:
            return err
        user.email = email

    losing_admin = False
    if "role_id" in data:
        role = Role.query.get(int(data.get("role_id") or 0))
        if not role:
            return _error("role_required", "Elegí un rol.")
        losing_admin = user.is_admin and not role.is_admin
        user.role_id = role.id
        user.role = "ADMIN" if role.is_admin else "OPERATOR"

    if "is_active" in data:
        active = bool(data.get("is_active"))
        if not active and me and me.id == user.id:
            return _error("cannot_disable_self", "No podés desactivar tu propio usuario.")
        losing_admin = losing_admin or (user.is_admin and user.is_active and not active)
        if user.is_active and not active:
            StaffTrustedIp.forget_user(user.id)
        user.is_active = active

    if losing_admin and _active_admins_excluding(user.id) == 0:
        db.session.rollback()
        return _error("last_admin", "Tiene que quedar al menos un administrador activo.")
    if me and me.id == user.id and losing_admin:
        db.session.rollback()
        return _error("cannot_demote_self", "No podés quitarte el rol de administrador a vos mismo.")

    password = data.get("password") or ""
    if password:
        if len(password) < MIN_PASSWORD_LENGTH:
            return _error("weak_password", f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.")
        user.set_password(password)

    db.session.commit()
    return jsonify(user_to_dict(user))


@bp.delete("/<int:user_id>")
def delete_user(user_id: int):
    denied = _require_admin()
    if denied:
        return denied
    user = User.query.get_or_404(user_id)
    me = current_staff_user()
    if me and me.id == user.id:
        return _error("cannot_delete_self", "No podés eliminar tu propio usuario.")
    if user.is_admin and user.is_active and _active_admins_excluding(user.id) == 0:
        return _error("last_admin", "Tiene que quedar al menos un administrador activo.")
    try:
        # Son rastros de sesión, no historial: si quedan, la FK impide borrar el usuario
        # y el error se confunde con "tiene pagos o facturas".
        LoginChallenge.query.filter_by(user_id=user.id).delete(synchronize_session=False)
        StaffTrustedIp.forget_user(user.id)
        db.session.delete(user)
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error(
            "user_in_use",
            "El usuario tiene pagos o facturas registrados a su nombre. Desactivalo en lugar de eliminarlo.",
            409,
        )
    return jsonify({"ok": True})


# ─────────────────────────────────────────────
# Roles
# ─────────────────────────────────────────────

def _role_to_dict(role: Role) -> dict:
    perms = {m: list(a) for m, a in MODULE_ACTIONS.items()} if role.is_admin else role.get_permissions()
    return {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "is_admin": bool(role.is_admin),
        "permissions": perms,
        "users_count": User.query.filter_by(role_id=role.id).count(),
    }


def _clean_permissions(raw) -> dict[str, list[str]]:
    if not isinstance(raw, dict):
        return {}
    out = {}
    for module, actions in raw.items():
        allowed = MODULE_ACTIONS.get(str(module))
        if not allowed or not isinstance(actions, list):
            continue
        chosen = [a for a in allowed if a in actions]
        # Editar o eliminar sin poder ver la sección no tiene sentido en el panel.
        if chosen and "view" not in chosen:
            chosen = ["view"] + chosen
        if chosen:
            out[str(module)] = chosen
    return out


@roles_bp.get("/catalog")
def permissions_catalog():
    return jsonify({
        "modules": [{"id": m, "label": label, "actions": actions} for m, label, actions in MODULES],
        "actions": [{"id": a, "label": label} for a, label in ACTION_LABELS.items()],
    })


@roles_bp.get("")
def list_roles():
    roles = Role.query.order_by(Role.is_admin.desc(), Role.name.asc()).all()
    return jsonify([_role_to_dict(r) for r in roles])


@roles_bp.post("")
def create_role():
    denied = _require_admin()
    if denied:
        return denied
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return _error("name_required", "Completá el nombre del rol.")
    if Role.query.filter(func.lower(Role.name) == name.lower()).first():
        return _error("name_taken", "Ya existe un rol con ese nombre.", 409)
    role = Role(name=name[:60], description=(data.get("description") or "").strip()[:255] or None, is_admin=False)
    role.set_permissions(_clean_permissions(data.get("permissions")))
    db.session.add(role)
    db.session.commit()
    return jsonify(_role_to_dict(role)), 201


@roles_bp.put("/<int:role_id>")
def update_role(role_id: int):
    denied = _require_admin()
    if denied:
        return denied
    role = Role.query.get_or_404(role_id)
    data = request.get_json(force=True) or {}
    if role.is_admin and "permissions" in data:
        return _error("admin_role_locked", "El rol Administrador tiene todos los permisos y no se puede modificar.")
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            return _error("name_required", "Completá el nombre del rol.")
        if Role.query.filter(func.lower(Role.name) == name.lower(), Role.id != role.id).first():
            return _error("name_taken", "Ya existe un rol con ese nombre.", 409)
        role.name = name[:60]
    if "description" in data:
        role.description = (data.get("description") or "").strip()[:255] or None
    if "permissions" in data:
        role.set_permissions(_clean_permissions(data.get("permissions")))
    db.session.commit()
    return jsonify(_role_to_dict(role))


@roles_bp.delete("/<int:role_id>")
def delete_role(role_id: int):
    denied = _require_admin()
    if denied:
        return denied
    role = Role.query.get_or_404(role_id)
    if role.is_admin:
        return _error("admin_role_locked", "El rol Administrador no se puede eliminar.")
    in_use = User.query.filter_by(role_id=role.id).count()
    if in_use:
        return _error("role_in_use", f"Hay {in_use} usuario(s) con este rol. Asignales otro rol antes de eliminarlo.", 409)
    db.session.delete(role)
    db.session.commit()
    return jsonify({"ok": True})
