from fastapi import APIRouter, Depends, HTTPException

from app.model_store import DirectionModel, get_direction_model
from app.schemas import DirectionRequest, DirectionResponse

router = APIRouter()


@router.post("/predict/direction", response_model=DirectionResponse)
def predict_direction(
    req: DirectionRequest, model: DirectionModel = Depends(get_direction_model)
) -> DirectionResponse:
    try:
        direction, confidence = model.predict([p.model_dump() for p in req.prices])
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return DirectionResponse(direction=direction, confidence=confidence)
