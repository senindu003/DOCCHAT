from fastapi import FastAPI, APIRouter
from routers.auth import auth_router
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from user_db.database import Base, engine, SessionLocal
from user_db.models import UploadJob, UploadJobFile
from routers.set_info import set_info_router
from routers.get_info import get_info_router
from routers.documents import documents_router

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(bind=engine)
    # Upload bytes are kept in the container's temporary directory. They cannot
    # survive a redeploy, so do not leave clients polling an abandoned job.
    db = SessionLocal()
    try:
        abandoned_jobs = db.query(UploadJob).filter(UploadJob.status.in_(("queued", "processing"))).all()
        for job in abandoned_jobs:
            job.status = "failed"
            for item in db.query(UploadJobFile).filter(
                UploadJobFile.job_id == job.id,
                UploadJobFile.status.in_(("queued", "processing")),
            ):
                item.status = "failed"
                item.stage = "failed"
                item.progress = 100
                item.error = "Processing was interrupted by a service restart. Please upload this file again."
        db.commit()
    finally:
        db.close()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=False,
  allow_methods=["*"],
  allow_headers=["*"],
)

main_router = APIRouter()

@main_router.get("/")
async def root():  
  return {"message": "Hello World"}

app.include_router(main_router)
app.include_router(auth_router)
app.include_router(set_info_router)
app.include_router(get_info_router)
app.include_router(documents_router)

if __name__ == "__main__":
  import uvicorn
  uvicorn.run(app, host="0.0.0.0", port=8000)
