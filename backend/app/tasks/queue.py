import json
from datetime import datetime
from typing import Any, Dict, Optional

from ..extensions import db
from ..models.job import Job


JOB_MT_CREATE_PPP_SECRET = "MT_CREATE_PPP_SECRET"
JOB_MT_DELETE_PPP_SECRET = "MT_DELETE_PPP_SECRET"
JOB_MT_SET_PPP_PROFILE = "MT_SET_PPP_PROFILE"
JOB_MT_SET_PPP_REMOTE_ADDRESS = "MT_SET_PPP_REMOTE_ADDRESS"
JOB_MT_SET_PPP_CREDENTIALS = "MT_SET_PPP_CREDENTIALS"

# /ppp/profile sync (planes <-> Mikrotik)
JOB_MT_CREATE_PPP_PROFILE = "MT_CREATE_PPP_PROFILE"
JOB_MT_UPDATE_PPP_PROFILE = "MT_UPDATE_PPP_PROFILE"
JOB_MT_DELETE_PPP_PROFILE = "MT_DELETE_PPP_PROFILE"

# Billing jobs
JOB_BILLING_UPDATE_CLIENT_SERVICES = "BILLING_UPDATE_CLIENT_SERVICES"


def enqueue_job(
    *,
    job_type: str,
    payload: Dict[str, Any],
    server_id: Optional[int] = None,
    run_after: Optional[datetime] = None,
) -> Job:
    j = Job(
        job_type=job_type,
        status="PENDING",
        attempts=0,
        run_after=run_after,
        server_id=server_id,
        payload_json=json.dumps(payload, ensure_ascii=False),
    )
    db.session.add(j)
    db.session.commit()
    return j

