from fastapi import FastAPI

from app.routers.analysis import router as analysis_router

app = FastAPI(title="SoulSafe AI Analysis Service", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-python"}


app.include_router(analysis_router, prefix="/ai", tags=["analysis"])
