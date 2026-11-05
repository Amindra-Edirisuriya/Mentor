from fastapi import FastAPI

from app.api.projects import router as projects_router
from app.api.summaries import router as summaries_router
from app.config import get_settings

settings = get_settings()

app = FastAPI(title=settings.app_name)
app.include_router(projects_router)
app.include_router(summaries_router)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check. Does not touch the database."""
    return {"status": "ok"}
