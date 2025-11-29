from pydantic import BaseModel

class TreadmillStatus(BaseModel):
    isConnected: bool
    isRunning: bool
    currentSpeedKmh: float

class SpeedRequest(BaseModel):
    speedKmh: float