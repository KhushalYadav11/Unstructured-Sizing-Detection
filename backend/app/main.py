from fastapi import FastAPI
from app.routers import auth, jobs, models, reports, dashboard
from app.db import Base, engine

app = FastAPI()

# Development: ensure tables exist (use Alembic migrations in production)
@app.on_event("startup")
def on_startup() -> None:
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        # Avoid crashing if migrations are preferred; logs can be added here
        pass

app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(models.router)
app.include_router(reports.router)
app.include_router(dashboard.router)
