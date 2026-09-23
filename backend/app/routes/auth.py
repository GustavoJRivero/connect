"""Autenticación del panel: email o usuario + contraseña + código por email.

Flujo:
  1. POST /login con identificador y contraseña. Si las credenciales son
     válidas se envía un código al email y se devuelve `challenge_id`.
  2. POST /login/verify con `challenge_id` y el código → token de sesión.

Nunca se emite sesión sin verificar el código. Si el usuario no tiene email
o el SMTP no está configurado, el ingreso se rechaza.
"""

import hashlib
import hmac
import secrets
import uuid
from html import escape
from datetime import datetime, timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import create_access_token
from sqlalchemy import func
from werkzeug.security import check_password_hash, generate_password_hash

from ..acl import load_staff_user, log_activity, user_permissions
from ..extensions import db
from ..mailer import SmtpNotConfigured, send_mail, smtp_configured
from ..models.auth_security import LoginChallenge, UserActivity
from ..models.role import Role
from ..models.user import User
from ..recaptcha import recaptcha_public_config, verify_recaptcha
from ..timezone import iso_utc

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

CODE_TTL = timedelta(minutes=10)
RESEND_COOLDOWN = timedelta(seconds=30)
MAX_CODE_ATTEMPTS = 5
MAX_CODE_SENDS_PER_USER = 5
MAX_CODE_SENDS_PER_IP = 20
FAILED_WINDOW = timedelta(minutes=15)
MAX_FAILED_PER_IDENTIFIER = 5
MAX_FAILED_PER_IP = 20
MIN_PASSWORD_LENGTH = 12
DUMMY_PASSWORD_HASH = generate_password_hash(secrets.token_urlsafe(32))


def user_to_dict(user: User) -> dict:
    role = user.role_ref
    return {
        "id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "full_name": user.full_name,
        "email": user.email,
        "is_active": bool(user.is_active),
        "is_admin": user.is_admin,
        "role": {"id": role.id, "name": role.name, "is_admin": bool(role.is_admin)} if role else None,
        "last_login_at": iso_utc(user.last_login_at) if user.last_login_at else None,
        "created_at": iso_utc(user.created_at) if user.created_at else None,
    }


def normalize_email(value) -> str:
    return str(value or "").strip().lower()


def valid_email(value: str) -> bool:
    return bool(value) and "@" in value and "." in value.split("@")[-1] and " " not in value


def _find_user(identifier: str) -> User | None:
    ident = identifier.strip()
    if "@" in ident:
        return User.query.filter(func.lower(User.email) == ident.lower()).first()
    return User.query.filter_by(username=ident).first()


def _client_ip() -> str:
    return (request.remote_addr or "")[:64]


def _too_many_failures(identifier: str, user: User | None) -> bool:
    since = datetime.utcnow() - FAILED_WINDOW
    base = UserActivity.query.filter(UserActivity.action == "LOGIN_FAILED", UserActivity.created_at >= since)
    who = func.lower(UserActivity.username) == identifier.lower()
    if user is not None:
        who = who | (UserActivity.user_id == user.id)
    by_ident = base.filter(who).count()
    by_ip = base.filter(UserActivity.ip == _client_ip()).count()
    return by_ident >= MAX_FAILED_PER_IDENTIFIER or by_ip >= MAX_FAILED_PER_IP


def _hash_code(challenge_id: str, code: str) -> str:
    secret = str(current_app.config.get("SECRET_KEY") or "").encode()
    return hmac.new(secret, f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()


def _challenge_proof(challenge_id: str) -> str:
    """Prueba no derivable que evita usar un challenge_id filtrado."""
    secret = str(current_app.config.get("SECRET_KEY") or "").encode()
    return hmac.new(secret, f"login-challenge:{challenge_id}".encode(), hashlib.sha256).hexdigest()


def _valid_challenge_proof(challenge_id: str, proof: str) -> bool:
    return bool(proof) and hmac.compare_digest(_challenge_proof(challenge_id), proof)


def _challenge_response(challenge_id: str):
    return jsonify({
        "require_code": True,
        "challenge_id": challenge_id,
        "challenge_token": _challenge_proof(challenge_id),
        "email_hint": "tu email registrado",
        "expires_in": int(CODE_TTL.total_seconds()),
        "resend_in": int(RESEND_COOLDOWN.total_seconds()),
    })


def _fake_challenge_response():
    return _challenge_response(str(uuid.uuid4()))


def _too_many_code_sends(user: User) -> bool:
    since = datetime.utcnow() - FAILED_WINDOW
    base = UserActivity.query.filter(
        UserActivity.action == "LOGIN_CODE_SENT",
        UserActivity.created_at >= since,
    )
    by_user = base.filter(UserActivity.user_id == user.id).count()
    by_ip = base.filter(UserActivity.ip == _client_ip()).count()
    return by_user >= MAX_CODE_SENDS_PER_USER or by_ip >= MAX_CODE_SENDS_PER_IP


def _mask_email(email: str) -> str:
    local, _, domain = email.partition("@")
    shown = local[:2] if len(local) > 2 else local[:1]
    return f"{shown}{'*' * max(len(local) - len(shown), 3)}@{domain}"


def _send_code(user: User, challenge: LoginChallenge) -> None:
    code = f"{secrets.randbelow(1_000_000):06d}"
    challenge.code_hash = _hash_code(challenge.id, code)
    challenge.last_sent_at = datetime.utcnow()
    challenge.expires_at = datetime.utcnow() + CODE_TTL
    minutes = int(CODE_TTL.total_seconds() // 60)
    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <p>Hola <b>{escape(user.full_name or user.username)}</b>,</p>
        <p>Tu código para ingresar al panel es:</p>
        <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 16px 0;">{code}</p>
        <p>Vence en {minutes} minutos. Si no fuiste vos, ignorá este mensaje y cambiá tu contraseña.</p>
    </div>
    """
    send_mail(
        to=user.email,
        subject="Tu código de ingreso al panel",
        html=html,
        text=f"Tu código para ingresar al panel es {code}. Vence en {minutes} minutos.",
    )


def _create_staff_token(user: User) -> str:
    return create_access_token(
        identity=str(user.id),
        additional_claims={"typ": "staff", "auth_version": user.auth_version},
    )


def _issue_session(user: User):
    user.last_login_at = datetime.utcnow()
    db.session.commit()
    token = _create_staff_token(user)
    log_activity(
        action="LOGIN",
        module="auth",
        summary="Inició sesión con código por email",
        user=user,
        status_code=200,
        details={"verified_by": "email_code"},
    )
    return jsonify({"access_token": token})


@bp.get("/security-config")
def security_config():
    body = recaptcha_public_config()
    # El alta del primer admin solo tiene sentido con la base vacía y un token configurado.
    body["bootstrap_available"] = bool(
        User.query.count() == 0 and str(current_app.config.get("BOOTSTRAP_TOKEN") or "")
    )
    return jsonify(body)


@bp.post("/bootstrap")
def bootstrap_admin():
    """Crea el primer administrador si todavía no hay usuarios."""
    if User.query.count() > 0:
        return jsonify({"error": "already_bootstrapped", "message": "Ya existe un administrador."}), 409

    data = request.get_json(force=True) or {}
    expected_token = str(current_app.config.get("BOOTSTRAP_TOKEN") or "")
    provided_token = str(request.headers.get("X-Bootstrap-Token") or data.get("bootstrap_token") or "")
    if not expected_token:
        return jsonify({
            "error": "bootstrap_disabled",
            "message": "Para crear el primer administrador hay que definir BOOTSTRAP_TOKEN en el servidor.",
        }), 403
    if not hmac.compare_digest(expected_token, provided_token):
        return jsonify({"error": "invalid_bootstrap_token", "message": "Token de instalación inválido."}), 403
    if not verify_recaptcha(str(data.get("recaptcha_token") or ""), "staff_bootstrap"):
        return jsonify({"error": "recaptcha_failed", "message": "No pudimos validar que seas una persona."}), 400
    username = (data.get("username") or "").strip()
    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    password = data.get("password") or ""
    email = normalize_email(data.get("email"))

    if not username or not password:
        return jsonify({"error": "username_and_password_required", "message": "Completá usuario y contraseña."}), 400
    if not first_name or not last_name:
        return jsonify({"error": "name_required", "message": "Completá el nombre y el apellido."}), 400
    if len(password) < MIN_PASSWORD_LENGTH:
        return jsonify({
            "error": "weak_password",
            "message": f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.",
        }), 400
    if not valid_email(email):
        return jsonify({"error": "email_required", "message": "El email es obligatorio: ahí llega el código de ingreso."}), 400

    admin_role = Role.query.filter_by(is_admin=True).order_by(Role.id.asc()).first()
    user = User(
        username=username,
        first_name=first_name[:80],
        last_name=last_name[:80],
        email=email,
        role="ADMIN",
        role_id=admin_role.id if admin_role else None,
        is_active=True,
    )
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    log_activity(action="CREATE", module="users", summary="Creó el primer administrador", user=user, status_code=200, details={"username": username})
    return jsonify(user_to_dict(user))


@bp.post("/login")
def login():
    data = request.get_json(force=True) or {}
    if not verify_recaptcha(str(data.get("recaptcha_token") or ""), "staff_login"):
        return jsonify({"error": "recaptcha_failed", "message": "No pudimos validar que seas una persona."}), 400
    identifier = (data.get("identifier") or data.get("email") or data.get("username") or "").strip()
    password = data.get("password") or ""
    if not identifier or not password:
        return jsonify({"error": "credentials_required", "message": "Ingresá tu email o usuario y la contraseña."}), 400

    user = _find_user(identifier)
    if _too_many_failures(identifier, user):
        return jsonify({
            "error": "too_many_attempts",
            "message": "Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo.",
        }), 429

    password_ok = user.check_password(password) if user else check_password_hash(DUMMY_PASSWORD_HASH, password)
    if not user or not user.is_active or not password_ok:
        log_activity(
            action="LOGIN_FAILED",
            module="auth",
            summary="Intento de ingreso fallido" + ("" if user else " (usuario inexistente)") + (" (usuario inactivo)" if user and not user.is_active else ""),
            user=user if user else None,
            username=identifier.lower(),
            status_code=401,
            details={"identifier": identifier},
        )
        return _fake_challenge_response()

    # La contraseña ya está validada, así que acá conviene decir la verdad en vez de
    # mostrar la pantalla del código sin haber mandado nada.
    if not user.email:
        current_app.logger.warning("Login bloqueado: el usuario %s no tiene email", user.id)
        return jsonify({
            "error": "email_missing",
            "message": "Tu usuario no tiene email cargado, así que no podemos enviarte el código. Pedile a un administrador que lo complete.",
        }), 409
    if not smtp_configured():
        current_app.logger.error("Login bloqueado: SMTP no configurado")
        return jsonify({
            "error": "smtp_unavailable",
            "message": "El servidor de correo no está configurado, no podemos enviarte el código.",
        }), 503
    if _too_many_code_sends(user):
        return jsonify({
            "error": "too_many_codes",
            "message": "Se enviaron demasiados códigos en los últimos 15 minutos. Esperá y probá de nuevo.",
        }), 429

    challenge = LoginChallenge(
        id=str(uuid.uuid4()),
        user_id=user.id,
        code_hash="",
        expires_at=datetime.utcnow() + CODE_TTL,
        last_sent_at=datetime.utcnow(),
        attempts=0,
        ip=_client_ip(),
    )
    try:
        _send_code(user, challenge)
    except SmtpNotConfigured:
        current_app.logger.error("Login bloqueado: SMTP no configurado durante el envío")
        return jsonify({
            "error": "smtp_unavailable",
            "message": "El servidor de correo no está configurado, no podemos enviarte el código.",
        }), 503
    except Exception as e:
        current_app.logger.warning("No se pudo enviar el código de ingreso a %s: %s", user.email, e)
        return jsonify({
            "error": "code_send_failed",
            "message": "No pudimos enviar el código. Revisá la configuración de correo e intentá de nuevo.",
        }), 502
    db.session.add(challenge)
    db.session.commit()
    log_activity(
        action="LOGIN_CODE_SENT",
        module="auth",
        summary=f"Se envió el código de ingreso a {_mask_email(user.email)}",
        user=user,
        status_code=200,
        details={"email": _mask_email(user.email)},
    )
    return _challenge_response(challenge.id)


def _active_challenge(challenge_id: str):
    challenge = LoginChallenge.query.get(challenge_id) if challenge_id else None
    if not challenge or challenge.consumed_at is not None:
        return None, None, (jsonify({"error": "invalid_challenge", "message": "El código ya no es válido. Volvé a iniciar sesión."}), 400)
    user = User.query.get(challenge.user_id)
    if not user or not user.is_active:
        return None, None, (jsonify({"error": "invalid_challenge", "message": "El usuario no está activo."}), 400)
    return challenge, user, None


@bp.post("/login/verify")
def verify_login_code():
    data = request.get_json(force=True) or {}
    challenge_id = str(data.get("challenge_id") or "")
    if not _valid_challenge_proof(challenge_id, str(data.get("challenge_token") or "")):
        return jsonify({"error": "invalid_challenge", "message": "El código ya no es válido. Volvé a iniciar sesión."}), 400
    challenge, user, err = _active_challenge(challenge_id)
    if err:
        return jsonify({"error": "invalid_code", "message": "Código incorrecto o vencido."}), 401
    code = "".join(ch for ch in str(data.get("code") or "") if ch.isdigit())

    if datetime.utcnow() > challenge.expires_at:
        return jsonify({"error": "code_expired", "message": "El código venció. Pedí uno nuevo."}), 400
    if challenge.attempts >= MAX_CODE_ATTEMPTS:
        return jsonify({"error": "too_many_attempts", "message": "Superaste los intentos. Volvé a iniciar sesión."}), 429

    if len(code) != 6 or not hmac.compare_digest(challenge.code_hash, _hash_code(challenge.id, code)):
        challenge.attempts += 1
        db.session.commit()
        left = MAX_CODE_ATTEMPTS - challenge.attempts
        log_activity(
            action="LOGIN_FAILED",
            module="auth",
            summary="Código de ingreso incorrecto",
            user=user,
            status_code=401,
            details={"intentos_restantes": left},
        )
        return jsonify({
            "error": "invalid_code",
            "message": "Código incorrecto." + (f" Te quedan {left} intentos." if left > 0 else " Volvé a iniciar sesión."),
        }), 401

    challenge.consumed_at = datetime.utcnow()
    return _issue_session(user)


@bp.post("/login/resend")
def resend_login_code():
    data = request.get_json(force=True) or {}
    challenge_id = str(data.get("challenge_id") or "")
    if not _valid_challenge_proof(challenge_id, str(data.get("challenge_token") or "")):
        return jsonify({"error": "invalid_challenge", "message": "El código ya no es válido. Volvé a iniciar sesión."}), 400
    challenge, user, err = _active_challenge(challenge_id)
    if err:
        return jsonify({"ok": True, "resend_in": int(RESEND_COOLDOWN.total_seconds())})
    if challenge.attempts >= MAX_CODE_ATTEMPTS:
        return jsonify({"error": "too_many_attempts", "message": "Superaste los intentos. Volvé a iniciar sesión."}), 429
    if _too_many_code_sends(user):
        return jsonify({
            "error": "too_many_attempts",
            "message": "Se enviaron demasiados códigos. Esperá 15 minutos y probá de nuevo.",
        }), 429
    wait = (challenge.last_sent_at + RESEND_COOLDOWN) - datetime.utcnow()
    if wait.total_seconds() > 0:
        return jsonify({
            "error": "resend_too_soon",
            "message": f"Esperá {int(wait.total_seconds()) + 1} segundos para pedir otro código.",
        }), 429
    try:
        _send_code(user, challenge)
    except Exception as e:
        current_app.logger.warning("No se pudo reenviar el código de ingreso a %s: %s", user.email, e)
        return jsonify({
            "error": "code_send_failed",
            "message": "No pudimos enviar el código. Reintentá en unos minutos.",
        }), 502
    db.session.commit()
    log_activity(
        action="LOGIN_CODE_SENT",
        module="auth",
        summary=f"Se reenvió el código de ingreso a {_mask_email(user.email)}",
        user=user,
        status_code=200,
        details={"email": _mask_email(user.email)},
    )
    return jsonify({"ok": True, "resend_in": int(RESEND_COOLDOWN.total_seconds())})


def _require_staff():
    try:
        user = load_staff_user()
    except Exception:
        user = None
    if user is None:
        return None, (jsonify({"error": "unauthorized", "message": "Iniciá sesión para continuar."}), 401)
    return user, None


@bp.post("/logout")
def logout():
    user, err = _require_staff()
    if err:
        return jsonify({"ok": True})
    log_activity(action="LOGOUT", module="auth", summary="Cerró sesión", user=user, status_code=200, include_request=False)
    return jsonify({"ok": True})


@bp.get("/me")
def me():
    user, err = _require_staff()
    if err:
        return err
    body = user_to_dict(user)
    body["permissions"] = user_permissions(user)
    body["smtp_configured"] = smtp_configured()
    return jsonify(body)


@bp.put("/me")
def update_me():
    """El usuario actualiza su email y/o contraseña (requiere la contraseña actual)."""
    user, err = _require_staff()
    if err:
        return err
    data = request.get_json(force=True) or {}
    current_password = data.get("current_password") or ""
    if not user.check_password(current_password):
        return jsonify({"error": "invalid_password", "message": "La contraseña actual no es correcta."}), 400

    changes = []
    if "first_name" in data or "last_name" in data:
        first_name = ((data.get("first_name") if "first_name" in data else user.first_name) or "").strip()
        last_name = ((data.get("last_name") if "last_name" in data else user.last_name) or "").strip()
        if not first_name or not last_name:
            return jsonify({"error": "name_required", "message": "Completá el nombre y el apellido."}), 400
        if (user.first_name or "", user.last_name or "") != (first_name, last_name):
            user.first_name = first_name[:80]
            user.last_name = last_name[:80]
            changes.append("nombre")
    if "email" in data:
        email = normalize_email(data.get("email"))
        if not valid_email(email):
            return jsonify({"error": "email_required", "message": "El email es obligatorio: ahí llega el código de ingreso."}), 400
        if User.query.filter(func.lower(User.email) == email, User.id != user.id).first():
            return jsonify({"error": "email_taken", "message": "Ese email ya lo usa otro usuario."}), 409
        if (user.email or "") != email:
            user.email = email
            changes.append("email")
    new_password = data.get("new_password") or ""
    password_changed = False
    if new_password:
        if len(new_password) < MIN_PASSWORD_LENGTH:
            return jsonify({"error": "weak_password", "message": f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres."}), 400
        user.set_password(new_password)
        password_changed = True
        changes.append("contraseña")

    db.session.commit()
    if changes:
        log_activity(
            action="UPDATE",
            module="users",
            summary=f"Actualizó su perfil ({', '.join(changes)})",
            user=user,
            status_code=200,
            ref_id=user.id,
            details={"cambios": changes},
        )
    body = user_to_dict(user)
    body["permissions"] = user_permissions(user)
    body["smtp_configured"] = smtp_configured()
    if password_changed:
        body["access_token"] = _create_staff_token(user)
    return jsonify(body)
