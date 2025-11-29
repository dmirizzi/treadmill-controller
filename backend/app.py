import logging
from fastapi.staticfiles import StaticFiles
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from models import TreadmillStatus, SpeedRequest
from treadmill_controller import TreadmillController
    
# -------- Logging setup --------
logger = logging.getLogger("treadmill")
logger.setLevel(logging.DEBUG)

# Avoid duplicate handlers if app is reloaded
if not logger.handlers:
    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s [%(levelname)s] %(name)s - %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

# -------- FastAPI app setup --------
controller = TreadmillController()

app = FastAPI()

# Log each request and exceptions
from fastapi.responses import JSONResponse
from fastapi.exceptions import HTTPException as FastAPIHTTPException

@app.middleware("http")
async def log_requests(request: Request, call_next):
    logger.info(f"--> {request.method} {request.url.path}")
    try:
        response = await call_next(request)
    except FastAPIHTTPException as http_exc:
        # Already handled in the endpoint; just log status
        logger.warning(
            f"HTTPException during {request.method} {request.url.path}: "
            f"status={http_exc.status_code}, detail={http_exc.detail}"
        )
        return JSONResponse(
            status_code=http_exc.status_code,
            content={"detail": http_exc.detail},
        )
    except Exception:
        logger.exception(f"Unhandled error during {request.method} {request.url.path}")
        raise

    logger.info(f"<-- {request.method} {request.url.path} {response.status_code}")
    return response


# CORS: allow your Angular dev server (adjust origins as you like)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4200",
        "http://127.0.0.1:4200",
        # add more origins if needed
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/status", response_model=TreadmillStatus)
async def get_status() -> TreadmillStatus:
    return controller.get_status()


@app.post("/api/connect", response_model=TreadmillStatus)
async def connect() -> TreadmillStatus:
    try:
        await controller.connect()
    except Exception as e:
        logger.exception("Error in /api/connect")
        raise HTTPException(status_code=500, detail=str(e))
    return controller.get_status()


@app.post("/api/disconnect", response_model=TreadmillStatus)
async def disconnect() -> TreadmillStatus:
    try:
        await controller.disconnect()
    except Exception as e:
        logger.exception("Error in /api/disconnect")
        raise HTTPException(status_code=500, detail=str(e))
    return controller.get_status()


@app.post("/api/start", response_model=TreadmillStatus)
async def start() -> TreadmillStatus:
    try:
        await controller.start()
    except Exception as e:
        logger.exception("Error in /api/start")
        raise HTTPException(status_code=500, detail=str(e))
    return controller.get_status()


@app.post("/api/stop", response_model=TreadmillStatus)
async def stop() -> TreadmillStatus:
    try:
        await controller.stop()
    except Exception as e:
        logger.exception("Error in /api/stop")
        raise HTTPException(status_code=500, detail=str(e))
    return controller.get_status()


@app.post("/api/speed", response_model=TreadmillStatus)
async def set_speed(req: SpeedRequest) -> TreadmillStatus:
    try:
        await controller.set_speed(req.speedKmh)
    except Exception as e:
        logger.exception("Error in /api/speed")
        raise HTTPException(status_code=500, detail=str(e))
    return controller.get_status()

# --- Static frontend (Angular build) ---
# Everything that is NOT /api/... will be served from ./static
app.mount("/", StaticFiles(directory="static", html=True), name="static")