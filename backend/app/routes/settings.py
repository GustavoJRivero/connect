from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required

from ..extensions import db
from ..models.setting import Setting

bp = Blueprint("settings", __name__, url_prefix="/api/settings")


def _get(key: str, default=None):
    s = Setting.query.get(key)
    return (s.value if s else default)


def _set(key: str, value: str):
    s = Setting.query.get(key)
    if not s:
        s = Setting(key=key, value=value)
        db.session.add(s)
    else:
        s.value = value


@bp.get("/kv")
@jwt_required(optional=True)
def get_kv():
    """
    Devuelve settings key/value.
    Query params:
    - prefix: filtra por prefijo (opcional)
    """
    prefix = (request.args.get("prefix") or "").strip()
    q = Setting.query
    if prefix:
        q = q.filter(Setting.key.like(f"{prefix}%"))
    items = q.order_by(Setting.key.asc()).all()
    return jsonify({s.key: s.value for s in items})


@bp.put("/kv")
@jwt_required(optional=True)
def put_kv():
    """
    Guarda settings key/value en lote.
    Body:
    {
      "values": {
        "plan.price.50M": "15000",
        "billing.due_days": "10"
      }
    }
    """
    data = request.get_json(force=True) or {}
    values = data.get("values") or {}
    if not isinstance(values, dict) or not values:
        return jsonify({"error": "values_required"}), 400

    for k, v in values.items():
        key = str(k).strip()
        if not key:
            continue
        _set(key, "" if v is None else str(v))

    db.session.commit()
    return jsonify({"status": "ok"})


@bp.get("/issuer")
@jwt_required(optional=True)
def get_issuer():
    return jsonify(
        {
            "cuit": _get("issuer.cuit", "30716906333"),
            "point_of_sale": int(_get("issuer.point_of_sale", "2")),
        }
    )


@bp.put("/issuer")
@jwt_required(optional=True)
def put_issuer():
    data = request.get_json(force=True) or {}
    cuit = str(data.get("cuit") or "").strip()
    point_of_sale = data.get("point_of_sale")

    if not cuit:
        return jsonify({"error": "cuit_required"}), 400
    if point_of_sale is None:
        return jsonify({"error": "point_of_sale_required"}), 400

    _set("issuer.cuit", cuit)
    _set("issuer.point_of_sale", str(int(point_of_sale)))
    db.session.commit()
    return jsonify({"status": "ok"})

