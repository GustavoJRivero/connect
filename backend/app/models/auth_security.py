from datetime import datetime

from ..extensions import db


class LoginChallenge(db.Model):
    """Código de verificación enviado por email durante el login."""

    __tablename__ = "login_challenges"

    id = db.Column(db.String(36), primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    code_hash = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    last_sent_at = db.Column(db.DateTime, nullable=False)
    attempts = db.Column(db.Integer, default=0, nullable=False)
    consumed_at = db.Column(db.DateTime, nullable=True)
    ip = db.Column(db.String(64), nullable=True)


class UserActivity(db.Model):
    """Acción realizada por un usuario del panel (auditoría)."""

    __tablename__ = "user_activity_logs"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    user_id = db.Column(db.Integer, nullable=True, index=True)
    username = db.Column(db.String(190), nullable=True)
    # CREATE / UPDATE / DELETE / ACTION / LOGIN / LOGIN_FAILED / LOGIN_CODE_SENT / LOGOUT / DENIED
    action = db.Column(db.String(32), nullable=False, index=True)
    module = db.Column(db.String(32), nullable=True, index=True)
    summary = db.Column(db.String(255), nullable=False)
    method = db.Column(db.String(8), nullable=True)
    path = db.Column(db.String(255), nullable=True)
    status_code = db.Column(db.Integer, nullable=True)
    ref_id = db.Column(db.BigInteger, nullable=True)
    ip = db.Column(db.String(64), nullable=True)
    user_agent = db.Column(db.String(255), nullable=True)
    details = db.Column(db.Text, nullable=True)
