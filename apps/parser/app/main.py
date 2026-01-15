from fastapi import FastAPI

from app.config import settings
from app.routers import health, parse

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
)

app.include_router(health.router)
app.include_router(parse.router, prefix="/api/v1")
