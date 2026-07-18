"""
Authentification à deux facteurs
"""
import io
import secrets

import pyotp
import qrcode
from django.core import signing
from django.core.signing import BadSignature, SignatureExpired

PENDING_LOGIN_SALT = 'clutchr.2fa.pending-login'
PENDING_LOGIN_MAX_AGE_SECONDS = 15 * 60
RECOVERY_CODE_COUNT = 8


def generate_secret() -> str:
    """Secret TOTP aléatoire, encodé en Base32 (format requis par la norme)."""
    return pyotp.random_base32()


def generate_qr_code_data_uri(secret: str, username: str) -> str:
    """QR code à scanner dans une app d'authentification, en data URI PNG."""
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=username, issuer_name='Clutchr')
    img = qrcode.make(uri)

    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    import base64
    encoded = base64.b64encode(buffer.getvalue()).decode('ascii')
    return f"data:image/png;base64,{encoded}"


def verify_totp_code(secret: str, code: str) -> bool:
    """Vérifie un code à 6 chiffres, avec une fenêtre de tolérance de ±1 période (30s)."""
    if not code or not code.isdigit():
        return False
    return pyotp.totp.TOTP(secret).verify(code, valid_window=1)


def generate_recovery_codes(count: int = RECOVERY_CODE_COUNT) -> list:
    """Codes de récupération à usage unique, pour le cas de perte de l'appareil."""
    return [secrets.token_hex(4) for _ in range(count)]


def create_pending_login_token(user_id: int) -> str:
    """
    Jeton temporaire signé identifiant un utilisateur ayant validé son
    mot de passe mais pas encore son code 2FA. Expire automatiquement,
    aucune trace en base nécessaire.
    """
    return signing.dumps({'user_id': user_id}, salt=PENDING_LOGIN_SALT)


def verify_pending_login_token(token: str) -> int | None:
    """Renvoie l'ID utilisateur si le jeton est valide et non expiré, sinon None."""
    try:
        data = signing.loads(token, salt=PENDING_LOGIN_SALT, max_age=PENDING_LOGIN_MAX_AGE_SECONDS)
    except (BadSignature, SignatureExpired):
        return None
    return data.get('user_id')
