from pydantic import BaseModel

class TreadmillStatus(BaseModel):
    isConnected: bool
    isRunning: bool
    currentSpeedKmh: float
    elapsedTimeSeconds: int
    burnedCalories: int
    totalDistanceKm: float
    minSpeedKmh: float
    maxSpeedKmh: float

class SpeedRequest(BaseModel):
    speedKmh: float