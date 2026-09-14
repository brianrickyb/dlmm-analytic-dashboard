from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, Depends, HTTPException, Security
from fastapi.security import APIKeyHeader

from app.model_store import get_direction_model, get_sentiment_pipeline
from app.routes.direction import router as direction_router
from app.routes.sentiment import router as sentiment_router

ML_SERVICE_API_KEY = os.environ.get("ML_SERVICE_API_KEY", "")
_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str | None = Security(_api_key_header)):
    """Require X-API-Key header when ML_SERVICE_API_KEY is configured.

    When the env var is unset/empty (local dev), all requests pass through —
    but once a key is set, every call must include it. This prevents an
    accidentally-exposed ml-service port from being abused.
    """
    if ML_SERVICE_API_KEY and api_key != ML_SERVICE_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_direction_model()
    get_sentiment_pipeline()
    yield


app = FastAPI(title="ml-service", lifespan=lifespan)

# Apply the API-key dependency globally so both routers inherit it.
app.include_router(direction_router, dependencies=[Depends(verify_api_key)])
app.include_router(sentiment_router, dependencies=[Depends(verify_api_key)])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
