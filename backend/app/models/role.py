import json
from datetime import datetime

from ..extensions import db


class Role(db.Model):
    """Rol de usuario del panel con sus permisos por módulo.

    `permissions` guarda un JSON `{"clients": ["view", "edit"], ...}`. Un rol con
    `is_admin` tiene todos los permisos y no se puede editar ni borrar.
    """

    __tablename__ = "roles"

    id = db.Column(db.Integer, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    name = db.Column(db.String(60), unique=True, nullable=False)
    description = db.Column(db.String(255), nullable=True)
    is_admin = db.Column(db.Boolean, default=False, nullable=False)
    permissions = db.Column(db.Text, nullable=True)

    def get_permissions(self) -> dict[str, list[str]]:
        try:
            raw = json.loads(self.permissions or "{}")
        except (TypeError, ValueError):
            return {}
        if not isinstance(raw, dict):
            return {}
        return {str(k): [str(a) for a in (v or [])] for k, v in raw.items() if isinstance(v, list)}

    def set_permissions(self, perms: dict[str, list[str]]) -> None:
        self.permissions = json.dumps(perms, ensure_ascii=False, sort_keys=True)
