from datetime import datetime

from ..extensions import db


class Job(db.Model):
    __tablename__ = "jobs"

    id = db.Column(db.BigInteger, primary_key=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    status = db.Column(db.String(16), nullable=False, default="PENDING", index=True)  # PENDING/RUNNING/DONE/FAILED
    job_type = db.Column(db.String(64), nullable=False, index=True)

    # Server al que aplica (Mikrotik)
    server_id = db.Column(db.BigInteger, db.ForeignKey("mikrotik_servers.id"), nullable=True, index=True)

    attempts = db.Column(db.Integer, nullable=False, default=0)
    run_after = db.Column(db.DateTime, nullable=True, index=True)

    locked_at = db.Column(db.DateTime, nullable=True)
    finished_at = db.Column(db.DateTime, nullable=True)

    payload_json = db.Column(db.Text, nullable=False, default="{}")
    result_json = db.Column(db.Text, nullable=True)
    last_error = db.Column(db.Text, nullable=True)

