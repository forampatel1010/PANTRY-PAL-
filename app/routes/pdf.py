import io
from typing import Any

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse, StreamingResponse

from app.services.pdf_service import build_recipe_pdf
from app.utils.response_formatter import error_response

router = APIRouter(prefix="/api", tags=["PDF"])


@router.post("/download-pdf")
async def download_pdf(recipe: dict[str, Any] = Body(...)):
    try:
        if not recipe or not isinstance(recipe, dict):
            payload = error_response(
                message="We need recipe details to make a PDF.",
                code="pdf_missing_body",
                hint="Generate a recipe first, then tap PDF on one of the recipe cards.",
            )
            return JSONResponse(status_code=422, content=payload)

        pdf_bytes, filename = build_recipe_pdf(recipe)
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-store",
            },
        )
    except Exception as e:
        payload = error_response(
            message="We couldn’t finish the PDF this time.",
            error=str(e),
            code="pdf_build",
            hint="Your recipe is still on screen — try the download again in a few seconds.",
        )
        return JSONResponse(status_code=500, content=payload)
