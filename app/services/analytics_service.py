"""
Append-only JSONL analytics log + lightweight aggregates for GET /api/analytics.
"""

from __future__ import annotations

import json
import re
import threading
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

_lock = threading.Lock()

_MAX_LINE_BYTES = 16_384
_MAX_LINES_READ = 6_000
_EVENT_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


def _data_dir() -> Path:
    p = Path(__file__).resolve().parent.parent / "data"
    p.mkdir(parents=True, exist_ok=True)
    return p


def log_file_path() -> Path:
    return _data_dir() / "analytics_events.jsonl"


def _sanitize(obj: Any, depth: int = 0) -> Any:
    if depth > 5:
        return None
    if obj is None or isinstance(obj, bool):
        return obj
    if isinstance(obj, (int, float)):
        if isinstance(obj, float) and not obj == obj:  # NaN
            return None
        return obj
    if isinstance(obj, str):
        return obj[:400] if len(obj) > 400 else obj
    if isinstance(obj, list):
        return [_sanitize(x, depth + 1) for x in obj[:40]]
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for i, (k, v) in enumerate(obj.items()):
            if i >= 40:
                break
            ks = str(k)[:64]
            if ks:
                out[ks] = _sanitize(v, depth + 1)
        return out
    return str(obj)[:400]


def append_event(raw: dict[str, Any]) -> dict[str, Any]:
    event = raw.get("event")
    if not isinstance(event, str) or not _EVENT_RE.match(event.strip()):
        raise ValueError("invalid_event")
    clean: dict[str, Any] = {"event": event.strip()}
    for k, v in raw.items():
        if k in ("event",):
            continue
        if k in ("received_at",):
            continue
        clean[k] = _sanitize(v)
    clean["received_at"] = datetime.now(timezone.utc).isoformat()
    line = json.dumps(clean, ensure_ascii=False, separators=(",", ":"))
    if len(line.encode("utf-8")) > _MAX_LINE_BYTES:
        clean = {"event": event.strip(), "truncated": True, "received_at": clean["received_at"]}
        line = json.dumps(clean, ensure_ascii=False, separators=(",", ":"))
    with _lock:
        with open(log_file_path(), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    return clean


def load_recent_events(max_lines: int = _MAX_LINES_READ) -> list[dict[str, Any]]:
    path = log_file_path()
    if not path.is_file():
        return []
    with _lock:
        try:
            with open(path, encoding="utf-8") as f:
                lines = f.readlines()
        except OSError:
            return []
    tail = lines[-max_lines:] if len(lines) > max_lines else lines
    out: list[dict[str, Any]] = []
    for line in tail:
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def summarize(events: list[dict[str, Any]]) -> dict[str, Any]:
    by_event = Counter()
    ingredient_hits = Counter()
    error_codes = Counter()
    confidences: list[float] = []
    recipe_ok = 0
    recipe_fail = 0

    for e in events:
        ev = e.get("event")
        if not isinstance(ev, str):
            continue
        by_event[ev] += 1

        if ev == "recipe_succeeded":
            recipe_ok += 1
            c = e.get("confidence")
            if isinstance(c, (int, float)):
                confidences.append(float(c))
        elif ev == "recipe_failed":
            recipe_fail += 1

        if ev in (
            "recipe_failed",
            "client_validation_error",
            "image_detect_failed",
            "pdf_failed",
            "api_error",
        ):
            code = e.get("code")
            if isinstance(code, str) and code.strip():
                error_codes[code.strip()[:80]] += 1
            else:
                error_codes["unknown"] += 1

        ings = e.get("ingredients")
        if isinstance(ings, list):
            for ing in ings:
                if isinstance(ing, str) and ing.strip():
                    ingredient_hits[ing.strip().lower()] += 1

    total_r = recipe_ok + recipe_fail
    success_pct = round(100.0 * recipe_ok / total_r, 1) if total_r else None
    avg_conf = round(sum(confidences) / len(confidences), 1) if confidences else None

    recent = []
    for e in events[-25:][::-1]:
        recent.append(
            {
                "event": e.get("event"),
                "received_at": e.get("received_at"),
                "summary": {
                    k: e.get(k)
                    for k in ("ingredient_count", "confidence", "fallback", "code", "cuisine")
                    if k in e and e.get(k) is not None
                },
            }
        )

    return {
        "total_events_loaded": len(events),
        "events_by_type": dict(by_event.most_common(40)),
        "top_ingredients": [{"ingredient": k, "count": v} for k, v in ingredient_hits.most_common(25)],
        "top_error_codes": [{"code": k, "count": v} for k, v in error_codes.most_common(15)],
        "recipe_success_count": recipe_ok,
        "recipe_failure_count": recipe_fail,
        "recipe_success_rate_percent": success_pct,
        "average_confidence_recipe_succeeded": avg_conf,
        "recent_activity": recent,
        "log_path": str(log_file_path()),
    }
