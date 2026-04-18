from fastapi import APIRouter, File, UploadFile

from app.services.vision_service import detect_ingredients_from_image
from app.utils.response_formatter import DEFAULT_INGREDIENT_SUGGESTIONS, error_response, success_response

router = APIRouter(prefix="/api", tags=["Vision"])


@router.post("/detect-ingredients")
async def detect_ingredients_endpoint(file: UploadFile = File(...)):
    """
    Multipart image upload → Gemini vision → sanitized ingredient list.

    Returns HTTP 200 with success true/false (same pattern as /generate-recipe) so browsers
    always receive JSON with message/hint — not a bare 422 that axios surfaces as generic text.
    """
    if not file.filename:
        return error_response(
            message="No photo was attached.",
            code="vision_no_file",
            hint="Choose a clear picture of food from your device, then tap detect again.",
        )

    body = await file.read()
    if not body:
        return error_response(
            message="That file looks empty.",
            code="vision_empty",
            hint="Try re‑selecting the image, or pick a different photo.",
        )

    mime = file.content_type or "application/octet-stream"
    result = await detect_ingredients_from_image(body, mime)

    if not result.get("ok"):
        return error_response(
            message=result.get("message") or "We couldn’t read ingredients from this photo.",
            code="vision_failed",
            hint="Use a well‑lit close‑up of the food, or type a few ingredients manually.",
            suggestions=list(DEFAULT_INGREDIENT_SUGGESTIONS),
        )

    return success_response(
        data={
            "ingredients": result["ingredients"],
            "noise_removed": result.get("noise_removed") or [],
            "note": result.get("note"),
        },
        message="Ingredients detected from image.",
    )
