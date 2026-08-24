from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required
from cryptography import x509
from cryptography.hazmat.primitives import serialization
import json
from datetime import datetime, timezone

from ..extensions import db
from ..models.setting import Setting
from ..migration.legacy import (
    MigrationError,
    apply_migration,
    get_migration_status,
    import_legacy_dump,
    preview_migration,
    save_uploaded_dump,
    MAX_DUMP_BYTES,
)
from ..validation import ValidationError, normalize_cuit

_HIDDEN_KV = ("afip.cert_pem", "afip.key_pem", "mp.access_token", "maps.api_key", "maps.webhook_secret")
_MAX_CERT_BYTES = 80_000

bp = Blueprint("settings", __name__, url_prefix="/api/settings")


def _get(key: str, default=None):
    s = Setting.query.get(key)
    return (s.value if s else default)


def _effective(setting_key: str, env_key: str) -> tuple[str, str]:
    raw = (_get(setting_key, "") or "").strip()
    if raw:
        return raw, "settings"
    from flask import current_app
    env = (current_app.config.get(env_key) or "").strip()
    return env, ("env" if env else "")


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
    out = {s.key: s.value for s in items if s.key not in _HIDDEN_KV}
    cert_pem = _get("afip.cert_pem", "") or ""
    key_pem = _get("afip.key_pem", "") or ""
    if (not prefix) or prefix.startswith("afip"):
        out["afip.cert_ready"] = "true" if cert_pem.strip() else "false"
        out["afip.key_ready"] = "true" if key_pem.strip() else "false"
        out.setdefault("afip.cert_filename", _get("afip.cert_filename", "") or "")
        out.setdefault("afip.key_filename", _get("afip.key_filename", "") or "")
    if (not prefix) or prefix.startswith("mp"):
        token, token_src = _effective("mp.access_token", "MP_ACCESS_TOKEN")
        public_key, _pk_src = _effective("mp.public_key", "MP_PUBLIC_KEY")
        webhook, _wh_src = _effective("mp.webhook_url", "MP_WEBHOOK_URL")
        out.pop("mp.access_token", None)
        out["mp.access_token_ready"] = "true" if token else "false"
        out["mp.access_token_source"] = token_src
        out["mp.public_key_ready"] = "true" if public_key else "false"
        out.setdefault("mp.public_key", public_key)
        out.setdefault("mp.webhook_url", webhook)
    if (not prefix) or prefix.startswith("maps"):
        api_key, api_key_src = _effective("maps.api_key", "MAPS_API_KEY")
        webhook_secret, wh_src = _effective("maps.webhook_secret", "MAPS_WEBHOOK_SECRET")
        base_url, _bu_src = _effective("maps.api_base_url", "MAPS_API_BASE_URL")
        out.pop("maps.api_key", None)
        out.pop("maps.webhook_secret", None)
        out["maps.api_key_ready"] = "true" if api_key else "false"
        out["maps.api_key_source"] = api_key_src
        out["maps.webhook_secret_ready"] = "true" if webhook_secret else "false"
        out["maps.webhook_secret_source"] = wh_src
        out.setdefault("maps.api_base_url", base_url or "https://maps.connectsrl.ar")
    return jsonify(out)


@bp.put("/kv")
@jwt_required(optional=True)
def put_kv():
    """
    Guarda settings key/value en lote.
    Body:
    {
      "values": {
        "plan.price.50M": "18150",
        "billing.due_days": "10"
      }
    }

    Nota: claves `plan.price.*` (fallback legacy) = monto total con IVA (precio final).
    """
    data = request.get_json(force=True) or {}
    values = data.get("values") or {}
    if not isinstance(values, dict) or not values:
        return jsonify({"error": "values_required"}), 400

    for k, v in values.items():
        key = str(k).strip()
        if not key:
            continue
        raw = "" if v is None else str(v)
        if key in ("issuer.cuit", "afip.cuit") and raw.strip():
            try:
                raw = normalize_cuit(raw) or raw
            except ValidationError as e:
                return e.to_response()
        _set(key, raw)

    db.session.commit()
    return jsonify({"status": "ok"})


def _pem_cert(raw: bytes) -> str:
    for loader in (x509.load_pem_x509_certificate, x509.load_der_x509_certificate):
        try:
            cert = loader(raw)
            return cert.public_bytes(serialization.Encoding.PEM).decode("utf-8")
        except Exception:
            continue
    raise ValidationError("afip_invalid_cert_file", "El certificado no es un .crt/.pem válido.")


def _pem_key(raw: bytes) -> str:
    for loader in (serialization.load_pem_private_key, serialization.load_der_private_key):
        try:
            key = loader(raw, password=None)
            return key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption(),
            ).decode("utf-8")
        except Exception:
            continue
    raise ValidationError(
        "afip_invalid_key_file",
        "La clave privada no es válida o está protegida con contraseña.",
    )


@bp.post("/arca-certs")
@jwt_required(optional=True)
def upload_arca_certs():
    """Sube certificado y/o clave privada de ARCA y los guarda en settings."""
    cert_file = request.files.get("cert")
    key_file = request.files.get("key")
    if not cert_file and not key_file:
        return jsonify({"error": "files_required", "message": "Seleccioná el certificado y/o la clave."}), 400

    try:
        if cert_file and cert_file.filename:
            raw = cert_file.read()
            if len(raw) > _MAX_CERT_BYTES:
                return jsonify({"error": "file_too_large"}), 400
            _set("afip.cert_pem", _pem_cert(raw))
            _set("afip.cert_filename", (cert_file.filename or "certificado.crt")[:200])
        if key_file and key_file.filename:
            raw = key_file.read()
            if len(raw) > _MAX_CERT_BYTES:
                return jsonify({"error": "file_too_large"}), 400
            _set("afip.key_pem", _pem_key(raw))
            _set("afip.key_filename", (key_file.filename or "privada.key")[:200])
    except ValidationError as e:
        return e.to_response()

    db.session.commit()
    return jsonify({
        "status": "ok",
        "cert_filename": _get("afip.cert_filename", ""),
        "key_filename": _get("afip.key_filename", ""),
        "cert_ready": bool((_get("afip.cert_pem") or "").strip()),
        "key_ready": bool((_get("afip.key_pem") or "").strip()),
    })


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
    point_of_sale = data.get("point_of_sale")

    try:
        cuit = normalize_cuit(data.get("cuit"))
    except ValidationError as e:
        return e.to_response()
    if not cuit:
        return jsonify({"error": "cuit_required", "message": "Ingresá el CUIT del emisor."}), 400
    if point_of_sale is None:
        return jsonify({"error": "point_of_sale_required"}), 400

    _set("issuer.cuit", cuit)
    _set("issuer.point_of_sale", str(int(point_of_sale)))
    db.session.commit()
    return jsonify({"status": "ok"})


@bp.get("/safety")
@jwt_required(optional=True)
def get_safety():
    from ..mikrotik.guard import safety_status

    return jsonify(safety_status())


@bp.get("/migration/status")
@jwt_required()
def migration_status():
    from flask import current_app

    status = get_migration_status(current_app.config["SQLALCHEMY_DATABASE_URI"])
    status["last_filename"] = _get("migration.last_filename", "") or ""
    status["last_at"] = _get("migration.last_at", "") or ""
    raw_summary = _get("migration.last_summary", "") or ""
    try:
        status["last_summary"] = json.loads(raw_summary) if raw_summary else None
    except (ValueError, TypeError):
        status["last_summary"] = None
    from ..mikrotik.guard import safety_status

    status["safety"] = safety_status()
    return jsonify(status)


@bp.post("/migration/upload")
@jwt_required()
def migration_upload():
    """Sube un dump SQL del sistema anterior, lo importa en legacy y devuelve un preview."""
    from flask import current_app

    dump = request.files.get("file")
    if not dump or not dump.filename:
        return jsonify({"error": "file_required", "message": "Seleccioná el archivo .sql del backup."}), 400
    if not dump.filename.lower().endswith(".sql"):
        return jsonify({"error": "invalid_file", "message": "El backup debe ser un archivo .sql."}), 400

    raw = dump.read()
    if len(raw) > MAX_DUMP_BYTES:
        return jsonify({
            "error": "file_too_large",
            "message": f"El archivo supera {MAX_DUMP_BYTES // (1024 * 1024)} MB.",
        }), 400

    try:
        path = save_uploaded_dump(dump.filename, raw)
        db_url = current_app.config["SQLALCHEMY_DATABASE_URI"]
        import_legacy_dump(db_url, path)
        summary = preview_migration(db_url)
        _set("migration.last_filename", (dump.filename or "backup.sql")[:200])
        _set("migration.last_at", datetime.now(timezone.utc).replace(microsecond=0).isoformat())
        _set("migration.last_summary", json.dumps(summary, ensure_ascii=False))
        db.session.commit()
        return jsonify({
            "status": "ok",
            "filename": dump.filename,
            "summary": summary,
        })
    except MigrationError as e:
        db.session.rollback()
        return jsonify({"error": e.code, "message": e.message}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "migration_failed", "message": str(e)}), 500


@bp.post("/migration/preview")
@jwt_required()
def migration_preview():
    """Analiza el backup ya importado en la base legacy (sin volver a subir el archivo)."""
    from flask import current_app

    try:
        summary = preview_migration(current_app.config["SQLALCHEMY_DATABASE_URI"])
        _set("migration.last_at", datetime.now(timezone.utc).replace(microsecond=0).isoformat())
        _set("migration.last_summary", json.dumps(summary, ensure_ascii=False))
        db.session.commit()
        return jsonify({"status": "ok", "summary": summary})
    except MigrationError as e:
        db.session.rollback()
        return jsonify({"error": e.code, "message": e.message}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "migration_failed", "message": str(e)}), 500


@bp.post("/migration/apply")
@jwt_required()
def migration_apply():
    """Aplica la migración desde legacy hacia Connect (reemplaza clientes/conexiones actuales)."""
    from flask import current_app

    try:
        summary = apply_migration(current_app.config["SQLALCHEMY_DATABASE_URI"])
        _set("migration.last_applied_at", summary.get("applied_at", ""))
        _set("migration.last_applied_summary", json.dumps(summary, ensure_ascii=False))
        db.session.commit()
        return jsonify({"status": "ok", "summary": summary})
    except MigrationError as e:
        db.session.rollback()
        return jsonify({"error": e.code, "message": e.message}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": "migration_failed", "message": str(e)}), 500

