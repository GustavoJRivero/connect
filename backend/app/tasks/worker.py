import json
import threading
import time
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


def _next_run_after(attempts: int) -> datetime:
    # backoff: 5s, 10s, 20s, ... max 15min
    seconds = min(5 * (2**attempts), 15 * 60)
    return _now() + timedelta(seconds=seconds)


def _execute_job(app: Flask, j: Job) -> Dict[str, Any]:
    payload = json.loads(j.payload_json or "{}")
    mt = _get_mt_from_job(j)
    if not mt:
        raise RuntimeError("mikrotik_server_not_configured")

    try:
        mt.connect()
        if j.job_type == JOB_MT_CREATE_PPP_SECRET:
            mt.add_pppoe_secret(
                name=str(payload["name"]),
                password=str(payload["password"]),
                profile=str(payload["profile"]),
                remote_address=(str(payload.get("remote_address")) if payload.get("remote_address") is not None else None),
            )
            return {"status": "created"}

        if j.job_type == JOB_MT_DELETE_PPP_SECRET:
            mt.remove_pppoe_secret(name=str(payload["name"]))
            return {"status": "deleted"}

        if j.job_type == JOB_MT_SET_PPP_PROFILE:
            mt.set_pppoe_secret_profile(name=str(payload["name"]), profile=str(payload["profile"]))
            return {"status": "updated", "profile": str(payload["profile"])}

        if j.job_type == JOB_MT_SET_PPP_REMOTE_ADDRESS:
            mt.set_pppoe_secret_remote_address(name=str(payload["name"]), remote_address=str(payload.get("remote_address") or ""))
            return {"status": "updated", "remote_address": str(payload.get("remote_address") or "")}

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


def _work_loop(app: Flask, poll_seconds: float):
    with app.app_context():
        while True:
            try:
                j = _claim_one_job()
                if not j:
                    time.sleep(poll_seconds)
                    continue

                try:
                    result = _execute_job(app, j)
                    j.status = "DONE"
                    j.finished_at = _now()
                    j.result_json = json.dumps(result, ensure_ascii=False)
                    j.last_error = None
                except Exception as e:
                    j.attempts = int(j.attempts or 0) + 1
                    j.last_error = str(e)
                    # reintenta hasta 5 veces, luego deja FAILED
                    if j.attempts >= 5:
                        j.status = "FAILED"
                        j.finished_at = _now()
                    else:
                        j.status = "PENDING"
                        j.run_after = _next_run_after(j.attempts)
                finally:
                    db.session.commit()
            except Exception:
                # evitar que el worker muera
                time.sleep(poll_seconds)


_worker_started = False


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

