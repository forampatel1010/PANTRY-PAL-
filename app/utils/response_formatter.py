import uuid
from typing import Any, Optional

DEFAULT_INGREDIENT_SUGGESTIONS = (
    "tomato",
    "onion",
    "potato",
    "egg",
    "rice",
    "paneer",
)


def success_response(data: Any = None, message: str = "", request_id: Optional[str] = None) -> dict:
    return {
        "success": True,
        "request_id": request_id or str(uuid.uuid4()),
        "data": data if data is not None else {},
        "message": message,
        "error": None,
    }


def error_response(
    message: str,
    error: Optional[str] = None,
    request_id: Optional[str] = None,
    *,
    hint: Optional[str] = None,
    suggestions: Optional[list[str]] = None,
    code: Optional[str] = None,
) -> dict:
    """User-facing errors: keep `message` short; add `hint` + `suggestions` for UX."""
    return {
        "success": False,
        "request_id": request_id or str(uuid.uuid4()),
        "data": {},
        "message": message,
        "error": error,
        "hint": hint,
        "suggestions": list(suggestions) if suggestions else [],
        "code": code,
    }
