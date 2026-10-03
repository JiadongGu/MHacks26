from fastapi import FastAPI

from app.integrations.fitbit.router import router as fitbit_router

from .router import router

app = FastAPI()
app.include_router(router)
app.include_router(fitbit_router)
