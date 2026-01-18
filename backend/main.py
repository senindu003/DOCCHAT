from fastapi import FastAPI, APIRouter
from routers.auth import auth_router
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from user_db.database import Base, engine
from routers.set_info import set_info_router
from routers.get_info import get_info_router

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(bind=engine)
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

if __name__ == "__main__":
  import uvicorn
  uvicorn.run(app, host="0.0.0.0", port=8000)
