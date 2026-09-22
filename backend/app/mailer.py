"""Envío de emails con la configuración SMTP del panel (settings `smtp.*`)."""

import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


class SmtpNotConfigured(RuntimeError):
    pass


def _setting(key: str, default: str = "") -> str:
    from .models.setting import Setting

    s = Setting.query.get(key)
    return str(s.value).strip() if s is not None and s.value is not None else default


def smtp_config() -> dict:
    user = _setting("smtp.user")
    return {
        "host": _setting("smtp.host"),
        "port": int(_setting("smtp.port", "587") or "587"),
        "user": user,
        "password": _setting("smtp.password"),
        "from_email": _setting("smtp.from_email") or user,
        "use_tls": (_setting("smtp.use_tls", "true") or "true").lower() in ("1", "true", "yes"),
    }


def smtp_configured() -> bool:
    cfg = smtp_config()
    return bool(cfg["host"] and cfg["user"] and cfg["password"])


def send_mail(*, to: str, subject: str, html: str, text: str | None = None) -> None:
    cfg = smtp_config()
    if not (cfg["host"] and cfg["user"] and cfg["password"]):
        raise SmtpNotConfigured("smtp_not_configured")

    sender_name = _setting("issuer.name", "Connect")
    msg = MIMEMultipart("alternative")
    msg["From"] = f"{sender_name} <{cfg['from_email']}>"
    msg["To"] = to
    msg["Subject"] = subject
    if text:
        msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))

    server = smtplib.SMTP(cfg["host"], cfg["port"], timeout=15)
    try:
        server.ehlo()
        if cfg["use_tls"]:
            server.starttls()
            server.ehlo()
        server.login(cfg["user"], cfg["password"])
        server.sendmail(cfg["from_email"], [to], msg.as_string())
    finally:
        try:
            server.quit()
        except Exception:
            pass
