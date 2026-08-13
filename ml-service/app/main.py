from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.model_store import get_direction_model, get_sentiment_pipeline
from app.routes.direction import router as direction_router
from app.routes.sentiment import router as sentiment_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    get_direction_model()
    get_sentiment_pipeline()
    yield


app = FastAPI(title="ml-service", lifespan=lifespan)
app.include_router(direction_router)
app.include_router(sentiment_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
