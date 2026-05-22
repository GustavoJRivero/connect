"""
Script de inicialización de datos esenciales.

En Docker, `entrypoint.sh` lo ejecuta después de `flask db upgrade` y antes de Gunicorn.
También podés correrlo a mano: `python seed.py` desde el directorio backend.

Es idempotente: solo crea datos que no existen.

Datos que inicializa:
- Planes de servicio por defecto (si no hay ninguno)
- Settings de facturación y scheduler (`billing.scheduler.*`) por defecto (si no existen)
"""
import sys
import os

# Necesario para poder importar la app
sys.path.insert(0, os.path.dirname(__file__))

from wsgi import app


def seed():
    with app.app_context():
        from app.extensions import db
        from app.models.plan import Plan
        from app.models.setting import Setting

        changes = False

        # ── Planes de servicio ──
        existing_plans = Plan.query.count()
        if existing_plans == 0:
            # `price` = precio final (IVA incluido), equivalente a los netos 12k/15k/20k/30k + 21% IVA.
            default_plans = [
                {"name": "25 Megas", "profile": "25M", "download_mbps": 25, "upload_mbps": 5, "price": 14520, "iva_percent": 21},
                {"name": "50 Megas", "profile": "50M", "download_mbps": 50, "upload_mbps": 10, "price": 18150, "iva_percent": 21},
                {"name": "100 Megas", "profile": "100M", "download_mbps": 100, "upload_mbps": 20, "price": 24200, "iva_percent": 21},
                {"name": "300 Megas", "profile": "300M", "download_mbps": 300, "upload_mbps": 50, "price": 36300, "iva_percent": 21},
            ]
            for pd in default_plans:
                db.session.add(Plan(**pd))
                print(f"  [SEED] Plan creado: {pd['name']} ({pd['profile']})")
            changes = True
        else:
            print(f"  [SEED] Planes: {existing_plans} existente(s), sin cambios.")

        # ── Settings de facturación ──
        default_settings = {
            "billing.mode": "GLOBAL",
            "billing.global_day": "1",
            "billing.due_days": "10",
            "billing.scheduler.enabled": "false",
            "billing.scheduler.run_hour": "6",
            "afip.enabled": "false",
            "afip.env": "HOMOLOGACION",
            "afip.cuit": "",
            "afip.cert_path": "",
            "afip.key_path": "",
            "afip.iva_percent_default": "21",
            "mikrotik.cut_profile": "suspended",
            "issuer.cuit": "",
            "issuer.point_of_sale": "1",
        }
        for key, default_value in default_settings.items():
            existing = db.session.get(Setting, key)
            if not existing:
                db.session.add(Setting(key=key, value=default_value))
                print(f"  [SEED] Setting creado: {key} = {default_value}")
                changes = True

        if changes:
            db.session.commit()
            print("  [SEED] Datos iniciales aplicados.")
        else:
            print("  [SEED] Sin cambios necesarios.")


if __name__ == "__main__":
    seed()
