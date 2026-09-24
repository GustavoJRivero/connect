"""TOTP (Google Authenticator, Authy, etc.) para el panel."""

import base64
import hashlib
import io

import pyotp
import qrcode
from cryptography.fernet import Fernet, InvalidToken
from flask import current_app
from qrcode.image.svg import SvgPathImage


def _fernet() -> Fernet:
    digest = hashlib.sha256(str(current_app.config.get("SECRET_KEY") or "").encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_secret(stored: str | None) -> str:
    if not stored:
        return ""
    try:
        return _fernet().decrypt(stored.encode()).decode()
    except (InvalidToken, ValueError):
        return ""


def new_secret() -> str:
    return pyotp.random_base32()


def verify_code(secret: str, code: str) -> bool:
    if not secret or len(code) != 6 or not code.isdigit():
        return False
    return bool(pyotp.TOTP(secret).verify(code, valid_window=1))


def otpauth_uri(*, secret: str, username: str, issuer: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=username, issuer_name=issuer or "Connect")


def qr_svg(data: str) -> str:
    img = qrcode.make(data, image_factory=SvgPathImage)
    buf = io.BytesIO()
    img.save(buf)
    return buf.getvalue().decode("utf-8")
