import argparse
import random
import sys
from datetime import datetime
from typing import Optional

import requests


PLAN_PROFILES = ["25M", "50M", "100M", "300M"]

FIRST_NAMES = [
    "Gustavo",
    "Juan",
    "María",
    "Ana",
    "Lucía",
    "Pedro",
    "Sofía",
    "Carlos",
    "Valentina",
    "Martín",
    "Nicolás",
    "Agustina",
]

LAST_NAMES = [
    "Gómez",
    "Pérez",
    "Rodríguez",
    "Fernández",
    "López",
    "Martínez",
    "García",
    "Sánchez",
    "Romero",
    "Torres",
    "Díaz",
]

STREETS = [
    "San Martín",
    "Belgrano",
    "Sarmiento",
    "Rivadavia",
    "Mitre",
    "Lavalle",
    "Italia",
    "España",
    "Urquiza",
    "9 de Julio",
]

CITIES = ["Corrientes", "Resistencia", "Posadas", "Formosa", "Santa Fe", "Paraná"]


def _rand_name() -> str:
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def _rand_company() -> str:
    return f"{random.choice(LAST_NAMES)} {random.choice(['SRL', 'SA', 'SAS'])}"


def _rand_addr() -> str:
    return f"{random.choice(STREETS)} {random.randint(10, 9999)}, {random.choice(CITIES)}"


def _rand_location() -> str:
    lat = -27.0 - random.random() * 1.5
    lon = -58.0 - random.random() * 1.5
    return f"GPS:{lat:.5f},{lon:.5f}"


def _pick_server_id(api_base_url: str) -> Optional[int]:
    try:
        r = requests.get(f"{api_base_url}/api/network/servers", timeout=5)
        r.raise_for_status()
        items = r.json() or []
        if not items:
            return None
        return int(random.choice(items)["id"])
    except Exception:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:5001", help="API base URL (default: http://127.0.0.1:5001)")
    ap.add_argument("--count", type=int, default=50, help="How many clients to create")
    ap.add_argument(
        "--provision-mikrotik",
        action="store_true",
        help="If set, enqueues Mikrotik provisioning jobs (default: false)",
    )
    args = ap.parse_args()

    api_base_url = str(args.api).rstrip("/")
    count = int(args.count)
    provision_mikrotik = bool(args.provision_mikrotik)

    random.seed(datetime.utcnow().timestamp())

    server_id = _pick_server_id(api_base_url)

    created = 0
    for i in range(count):
        is_company = random.random() < 0.3
        kind = "COMPANY" if is_company else "PERSON"

        full_name = _rand_company() if is_company else _rand_name()

        # unique-ish IDs
        dni = None
        cuit = None
        if kind == "PERSON":
            dni = str(40_000_000 + random.randint(0, 9_999_999) * 10 + i)
        else:
            # CUIT dummy: 30 + 9 digits + 1 digit (not validated)
            cuit = str(30_700_000_000 + random.randint(0, 9_999_999) * 10 + i)

        phone = f"11{random.randint(10000000, 99999999)}"
        email = f"user{i+1}@dummy.local"

        plan_profile = random.choice(PLAN_PROFILES)

        # 15% con IP fija para ver variedad en UI
        ip = None
        if random.random() < 0.15:
            ip = f"192.168.{random.randint(1, 20)}.{random.randint(2, 254)}"

        payload = {
            "kind": kind,
            "full_name": full_name,
            "dni": dni,
            "cuit": cuit,
            "phone": phone,
            "email": email,
            "connections": [
                {
                    "server_id": server_id,
                    "plan_profile": plan_profile,
                    "service_address": _rand_addr(),
                    "location": _rand_location(),
                    "ip": ip,
                }
            ],
            "provision_mikrotik": provision_mikrotik,
        }

        try:
            r = requests.post(f"{api_base_url}/api/clients", json=payload, timeout=15)
            if r.status_code >= 400:
                print(f"[{i+1}/{count}] ERROR {r.status_code}: {r.text}", file=sys.stderr)
                continue
            created += 1
            cid = (r.json() or {}).get("client", {}).get("id") or (r.json() or {}).get("id")
            print(f"[{i+1}/{count}] OK client_id={cid}")
        except Exception as e:
            print(f"[{i+1}/{count}] ERROR: {e}", file=sys.stderr)

    print(f"Done. Created {created}/{count}.")
    return 0 if created else 1


if __name__ == "__main__":
    raise SystemExit(main())

