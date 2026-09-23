from datetime import datetime

from werkzeug.security import check_password_hash, generate_password_hash

from ..extensions import db


class User(db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    first_name = db.Column(db.String(80), nullable=True)
    last_name = db.Column(db.String(80), nullable=True)
    email = db.Column(db.String(190), unique=True, nullable=True, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    # Legacy (ADMIN / OPERATOR); los permisos salen de `role_ref`.
    role = db.Column(db.String(32), nullable=False, default="ADMIN")
    role_id = db.Column(db.Integer, db.ForeignKey("roles.id"), nullable=True, index=True)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    last_login_at = db.Column(db.DateTime, nullable=True)
    auth_version = db.Column(db.Integer, default=1, nullable=False)

    role_ref = db.relationship("Role", lazy="joined")

    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)
        self.auth_version = int(self.auth_version or 0) + 1

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    @property
    def is_admin(self) -> bool:
        return bool(self.role_ref and self.role_ref.is_admin)

    @property
    def full_name(self) -> str:
        return " ".join(part for part in (self.first_name, self.last_name) if part).strip()
