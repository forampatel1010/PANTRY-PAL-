from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.settings import settings
from app.routes.recipe import router as recipe_router
from app.routes.search import router as search_router
from app.routes.pdf import router as pdf_router
from app.routes.vision import router as vision_router
from app.routes.analytics import router as analytics_router

app = FastAPI(
    title="RasoiAI",
    description="AI-powered cooking assistant backend",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(recipe_router)
app.include_router(search_router)
app.include_router(pdf_router)
app.include_router(vision_router)
app.include_router(analytics_router)


@app.get("/api/status", tags=["Health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "RasoiAI"}
