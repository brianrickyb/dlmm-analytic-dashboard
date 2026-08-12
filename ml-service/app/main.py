from fastapi import FastAPI

from app.routes.direction import router as direction_router

app = FastAPI(title="ml-service")
app.include_router(direction_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
