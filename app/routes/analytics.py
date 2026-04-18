import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.services.analytics_service import append_event, load_recent_events, summarize
from app.utils.response_formatter import success_response

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Analytics"])


@router.post("/analytics/event")
async def ingest_event(request: Request) -> dict[str, Any]:
    """Ingest one analytics event (JSON). Tolerant body size; safe for sendBeacon."""
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Expected JSON body")

    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body must be a JSON object")

    try:
        stored = append_event(body)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="Field 'event' must match ^[a-z][a-z0-9_]{0,63}$",
        )
    except OSError as e:
        logger.warning("analytics write failed: %s", e)
        raise HTTPException(status_code=503, detail="Analytics store unavailable")

    return success_response(data={"stored": True, "event": stored.get("event")}, message="ok")


@router.get("/analytics")
async def analytics_summary() -> dict[str, Any]:
    """Rollups over recent JSONL events (local dev / ops)."""
    events = load_recent_events()
    data = summarize(events)
    return success_response(data=data, message="Analytics summary.")
