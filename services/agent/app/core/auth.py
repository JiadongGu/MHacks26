import hashlib
import hmac

from fastapi import Header, HTTPException, Request

from app.core.config import settings


async def require_internal(x_internal_token: str = Header(default="")) -> None:
    if not hmac.compare_digest(x_internal_token, settings().internal_token):
        raise HTTPException(status_code=401, detail="bad internal token")


async def require_gateway_hmac(request: Request, x_signature: str = Header(default="")) -> None:
    body = await request.body()
    expected = hmac.new(settings().gateway_secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(x_signature, expected):
        raise HTTPException(status_code=401, detail="bad signature")
