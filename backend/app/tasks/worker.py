import json
import sys
import threading
import time
import traceback
from datetime import datetime, timedelta
from typing import Any, Dict

from flask import Flask

from ..extensions import db
from ..models.job import Job
from ..models.mikrotik_server import MikrotikServer
from ..mikrotik.ros_client import MikrotikRosClient
from .queue import (
    JOB_MT_CREATE_PPP_SECRET,
    JOB_MT_DELETE_PPP_SECRET,
    JOB_MT_SET_PPP_PROFILE,
    JOB_MT_SET_PPP_CREDENTIALS,
    JOB_MT_SET_PPP_REMOTE_ADDRESS,
)


def _get_mt_from_job(j: Job):
    if not j.server_id:
        return None
    s = MikrotikServer.query.get(int(j.server_id))
    if not s:
        return None
    return MikrotikRosClient(
        host=str(s.host),
        user=str(s.username),
        password=str(s.password),
        port=int(s.port or 8728),
        use_ssl=bool(s.use_ssl),
    )


def _now() -> datetime:
    return datetime.utcnow()


JOB_TIMEOUT_SECONDS = 30
# Jobs RUNNING con locked_at más viejo que esto se consideran colgados y se vuelven a PENDING
STUCK_RUNNING_SECONDS = 35


def _next_run_after(attempts: int) -> datetime:
    # backoff: 5s, 10s, 20s, ... max 15min
    seconds = min(5 * (2**attempts), 15 * 60)
    return _now() + timedelta(seconds=seconds)


def _require_keys(payload: dict, keys: list, job_type: str) -> None:
    missing = [k for k in keys if k not in payload]
    if missing:
        raise RuntimeError(f"payload_faltan_campos job={job_type} campos={','.join(missing)} payload_keys={list(payload.keys())}")


def _execute_job(app: Flask, j: Job) -> Dict[str, Any]:
    payload = json.loads(j.payload_json or "{}")
    mt = _get_mt_from_job(j)
    if not mt:
        raise RuntimeError("mikrotik_server_not_configured")

    try:
        mt.connect()
        if j.job_type == JOB_MT_CREATE_PPP_SECRET:
            _require_keys(payload, ["name", "password", "profile"], j.job_type)
            mt.add_pppoe_secret(
                name=str(payload["name"]),
                password=str(payload["password"]),
                profile=str(payload["profile"]),
                remote_address=(str(payload.get("remote_address")) if payload.get("remote_address") is not None else None),
            )
            return {"status": "created"}

        if j.job_type == JOB_MT_DELETE_PPP_SECRET:
            _require_keys(payload, ["name"], j.job_type)
            mt.remove_pppoe_secret(name=str(payload["name"]))
            return {"status": "deleted"}

        if j.job_type == JOB_MT_SET_PPP_PROFILE:
            _require_keys(payload, ["name", "profile"], j.job_type)
            name = str(payload["name"])
            mt.set_pppoe_secret_profile(name=name, profile=str(payload["profile"]))
            mt.disconnect_pppoe_session(name=name)
            return {"status": "updated", "profile": str(payload["profile"])}

        if j.job_type == JOB_MT_SET_PPP_REMOTE_ADDRESS:
            _require_keys(payload, ["name"], j.job_type)
            mt.set_pppoe_secret_remote_address(name=str(payload["name"]), remote_address=str(payload.get("remote_address") or ""))
            return {"status": "updated", "remote_address": str(payload.get("remote_address") or "")}

        if j.job_type == JOB_MT_SET_PPP_CREDENTIALS:
            if not payload.get("old_name") and not payload.get("name"):
                raise RuntimeError("payload_faltan_campos job=SET_PPP_CREDENTIALS necesita old_name o name")
            mt.set_pppoe_secret_credentials(
                old_name=str(payload.get("old_name") or payload.get("name") or ""),
                new_name=str(payload.get("name") or ""),
                new_password=str(payload.get("password") or ""),
            )
            return {"status": "updated", "name": str(payload.get("name") or "")}

        raise RuntimeError(f"unknown_job_type:{j.job_type}")
    finally:
        mt.close()


def _claim_one_job() -> Job:
    now = _now()
    q = (
        Job.query.filter(Job.status == "PENDING")
        .filter((Job.run_after.is_(None)) | (Job.run_after <= now))
        .order_by(Job.id.asc())
    )
    j = q.first()
    if not j:
        return None  # type: ignore
    j.status = "RUNNING"
    j.locked_at = now
    db.session.commit()
    return j


def _run_job_with_timeout(app: Flask, j: Job):
    """Ejecuta el job en un hilo; si supera JOB_TIMEOUT_SECONDS se considera timeout."""
    result_holder: list = []
    error_holder: list = []

    def run():
        with app.app_context():
            try:
                out = _execute_job(app, j)
                result_holder.append(out)
            except Exception as e:
                error_holder.append(e)

    th = threading.Thread(target=run, daemon=True)
    th.start()
    th.join(timeout=JOB_TIMEOUT_SECONDS)
    if th.is_alive():
        # Timeout: el hilo sigue corriendo pero dejamos de esperar
        raise TimeoutError(f"timeout: sin respuesta en {JOB_TIMEOUT_SECONDS} segundos")
    if error_holder:
        raise error_holder[0]
    if not result_holder:
        raise RuntimeError("job_no_retorno")
    return result_holder[0]


# PENDING con run_after más viejo que esto se considera "atascado" y se desbloquea (run_after=None)
PENDING_STUCK_MINUTES = 2


def _recover_stuck_running():
    """Vuelve a PENDING los jobs RUNNING que llevan más de STUCK_RUNNING_SECONDS (worker murió o timeout no actualizó)."""
    now = _now()
    cutoff = now - timedelta(seconds=STUCK_RUNNING_SECONDS)
    stuck = (
        Job.query.filter(Job.status == "RUNNING")
        .filter(Job.locked_at.isnot(None))
        .filter(Job.locked_at < cutoff)
        .all()
    )
    for j in stuck:
        j.status = "PENDING"
        j.locked_at = None
        j.run_after = None  # para que el worker lo tome de inmediato
    if stuck:
        db.session.commit()
    return len(stuck)


def _unblock_old_pending():
    """PENDING con run_after ya pasado o muy viejo: poner run_after=None para que el claim los tome."""
    now = _now()
    cutoff = now - timedelta(minutes=PENDING_STUCK_MINUTES)
    old = (
        Job.query.filter(Job.status == "PENDING")
        .filter(Job.run_after.isnot(None))
        .filter((Job.run_after <= now) | (Job.run_after < cutoff))
        .all()
    )
    for j in old:
        j.run_after = None
    if old:
        db.session.commit()
    return len(old)


def _work_loop(app: Flask, poll_seconds: float):
    with app.app_context():
        loop_count = 0
        while True:
            try:
                # Sesión nueva cada iteración para ver jobs insertados por la API (evita snapshot REPEATABLE-READ)
                try:
                    db.session.remove()
                except Exception as e:
                    print("worker: session.remove() falló (seguimos): %s" % e, file=sys.stderr, flush=True)
                _recover_stuck_running()
                _unblock_old_pending()
                j = _claim_one_job()
                if not j:
                    loop_count += 1
                    if loop_count % 30 == 0:
                        print("worker: poll sin jobs", flush=True)
                    time.sleep(poll_seconds)
                    continue
                loop_count = 0
                global _last_claim_at
                _last_claim_at = time.time()
                print("worker: claim job id=%s" % j.id, flush=True)

                try:
                    result = _run_job_with_timeout(app, j)
                    j.status = "DONE"
                    j.finished_at = _now()
                    j.result_json = json.dumps(result, ensure_ascii=False)
                    j.last_error = None
                except Exception as e:
                    j.attempts = int(j.attempts or 0) + 1
                    payload_preview = ""
                    try:
                        pl = json.loads(j.payload_json or "{}")
                        name = pl.get("name") or pl.get("old_name")
                        if name is not None:
                            payload_preview = f" name={name!r}"
                    except Exception:
                        pass
                    j.last_error = f"[{type(e).__name__}]{payload_preview} {e}"
                    j.locked_at = None
                    if j.attempts >= 2:
                        j.status = "FAILED"
                        j.finished_at = _now()
                    else:
                        j.status = "PENDING"
                        j.run_after = _next_run_after(j.attempts)
                finally:
                    db.session.commit()
            except Exception as e:
                # Log completo para ver por qué se cuelga el worker
                print("worker: ERROR en el loop: %s" % e, file=sys.stderr, flush=True)
                traceback.print_exc(file=sys.stderr)
                try:
                    db.session.rollback()
                except Exception:
                    pass
                time.sleep(poll_seconds)


_worker_started = False
_last_claim_at = None  # timestamp de la última vez que se reclamó un job (para /api/health)


def start_worker(app: Flask):
    global _worker_started
    if _worker_started:
        return
    if str(app.config.get("TASK_WORKER_ENABLED", "true")).lower() in ("0", "false", "no"):
        return
    poll_seconds = float(app.config.get("TASK_WORKER_POLL_SECONDS", 2))
    t = threading.Thread(target=_work_loop, args=(app, poll_seconds), daemon=True)
    t.start()
    _worker_started = True

