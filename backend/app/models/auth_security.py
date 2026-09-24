from datetime import datetime, timedelta

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
    method = db.Column(db.String(16), default="email", nullable=False)


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


class StaffTrustedIp(db.Model):
    """Última verificación por código de un usuario desde una IP.

    Si vuelve a entrar desde la misma IP dentro de 7 días, no se pide código.
    """

    __tablename__ = "staff_trusted_ips"
    __table_args__ = (db.UniqueConstraint("user_id", "ip", name="uq_staff_trusted_ip"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    ip = db.Column(db.String(64), nullable=False)
    verified_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    @classmethod
    def is_trusted(cls, user_id: int, ip: str, window: timedelta = timedelta(days=7)) -> bool:
        if not ip:
            return False
        row = cls.query.filter_by(user_id=user_id, ip=ip).first()
        return bool(row and row.verified_at and datetime.utcnow() - row.verified_at < window)

    @classmethod
    def remember(cls, user_id: int, ip: str) -> None:
        if not ip:
            return
        row = cls.query.filter_by(user_id=user_id, ip=ip).first()
        if row is None:
            row = cls(user_id=user_id, ip=ip)
            db.session.add(row)
        row.verified_at = datetime.utcnow()

    @classmethod
    def forget_user(cls, user_id: int) -> None:
        cls.query.filter_by(user_id=user_id).delete(synchronize_session=False)
