import io
import logging
import secrets
from datetime import date
from typing import Annotated, Optional
from uuid import uuid4

import pdfplumber
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine, select

from .auth import (
    AuthUser,
    GoogleAuthRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    google_sign_in,
    login_user,
    register_user,
    resolve_user,
    user_to_auth,
)
from .models import Course, Event, EventType, TaskStatus, User


logger = logging.getLogger(__name__)
bearer_scheme = HTTPBearer(auto_error=False)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./syllabussync.db"
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-3.5-flash-lite"
    jwt_secret: str = ""
    google_client_id: Optional[str] = None
    cors_origins: str = "http://localhost:5173,https://syllabus-sync-omega.vercel.app"


settings = Settings()
if not settings.jwt_secret:
    settings.jwt_secret = secrets.token_urlsafe(32)
    logger.warning("JWT_SECRET is not set; generated an ephemeral secret for this process.")

engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})


class ExtractedEvent(BaseModel):
    title: str
    due_date: date = Field(description="The event date in ISO 8601 format")
    event_type: EventType = EventType.assignment
    grade_weight: Optional[float] = Field(default=None, ge=0, le=100)
    notes: Optional[str] = None


class CourseInfo(BaseModel):
    code: str = Field(description="Course code, e.g. CS 101")
    title: str
    instructor: Optional[str] = None
    term: Optional[str] = None
    events: list[ExtractedEvent] = Field(default_factory=list)


class EventCreate(BaseModel):
    course_id: int
    title: str
    due_date: date
    event_type: EventType = EventType.assignment
    grade_weight: Optional[float] = None
    notes: Optional[str] = None
    status: TaskStatus = TaskStatus.todo


class EventUpdate(BaseModel):
    title: Optional[str] = None
    due_date: Optional[date] = None
    event_type: Optional[EventType] = None
    grade_weight: Optional[float] = None
    notes: Optional[str] = None
    status: Optional[TaskStatus] = None


class ChatRequest(BaseModel):
    course_id: int
    prompt: str = Field(min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    answer: str


class PublicConfig(BaseModel):
    google_client_id: Optional[str] = None


app = FastAPI(title="SyllabusSync API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def migrate_schema() -> None:
    """Add ownership columns to existing SQLite databases created before auth."""
    with engine.connect() as connection:
        course_columns = {
            row[1] for row in connection.execute(text("PRAGMA table_info(course)")).fetchall()
        }
        if course_columns and "user_id" not in course_columns:
            connection.execute(text("ALTER TABLE course ADD COLUMN user_id INTEGER"))
            connection.commit()


@app.on_event("startup")
def create_tables() -> None:
    SQLModel.metadata.create_all(engine)
    if settings.database_url.startswith("sqlite"):
        migrate_schema()


def get_session():
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def require_user(
    session: SessionDep,
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(bearer_scheme)] = None,
) -> User:
    return resolve_user(credentials, session, settings.jwt_secret)


UserDep = Annotated[User, Depends(require_user)]


def require_client() -> genai.Client:
    if not settings.gemini_api_key:
        raise HTTPException(503, "GEMINI_API_KEY is not configured on the server.")
    return genai.Client(api_key=settings.gemini_api_key)


def owned_course_or_404(course_id: int, user: User, session: Session) -> Course:
    course = session.get(Course, course_id)
    if not course or course.user_id != user.id:
        raise HTTPException(404, "Course not found")
    return course


def owned_event_or_404(event_id: int, user: User, session: Session) -> Event:
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    owned_course_or_404(event.course_id, user, session)
    return event


def user_course_ids(user: User, session: Session) -> list[int]:
    return list(session.exec(select(Course.id).where(Course.user_id == user.id)).all())


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config", response_model=PublicConfig)
def public_config():
    return PublicConfig(google_client_id=settings.google_client_id or None)


@app.post("/api/auth/register", response_model=TokenResponse)
def auth_register(payload: RegisterRequest, session: SessionDep):
    return register_user(session, payload, settings.jwt_secret)


@app.post("/api/auth/login", response_model=TokenResponse)
def auth_login(payload: LoginRequest, session: SessionDep):
    return login_user(session, payload, settings.jwt_secret)


@app.post("/api/auth/google", response_model=TokenResponse)
def auth_google(payload: GoogleAuthRequest, session: SessionDep):
    return google_sign_in(session, payload.credential, settings.google_client_id, settings.jwt_secret)


@app.get("/api/auth/me", response_model=AuthUser)
def auth_me(user: UserDep):
    return user_to_auth(user)


@app.post("/api/upload", status_code=201)
async def upload_syllabus(
    user: UserDep,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    if file.content_type not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(415, "Please upload a PDF file.")
    raw_pdf = await file.read()
    try:
        with pdfplumber.open(io.BytesIO(raw_pdf)) as pdf:
            syllabus_text = "\n".join(page.extract_text() or "" for page in pdf.pages)
    except Exception as exc:
        raise HTTPException(422, "Unable to read this PDF.") from exc
    if not syllabus_text.strip():
        raise HTTPException(422, "This PDF does not contain extractable text.")

    client = require_client()
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=(
                "Extract the course and every dated assignment, assessment, quiz, reading deadline, or exam "
                "from this syllabus. Never invent missing dates.\n\n"
                f"SYLLABUS:\n{syllabus_text[:120_000]}"
            ),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=CourseInfo,
            ),
        )
        if not response.text:
            raise ValueError("No structured result")
        info = CourseInfo.model_validate_json(response.text)
    except Exception as exc:
        logger.exception("Syllabus extraction failed")
        raise HTTPException(502, "Syllabus extraction failed. Check the Gemini configuration and try again.") from exc

    owned_count = len(session.exec(select(Course).where(Course.user_id == user.id)).all())
    palette = ["#6366f1", "#10b981", "#f97316", "#ec4899", "#06b6d4"]
    color = palette[owned_count % len(palette)]
    course = Course(
        user_id=user.id,
        code=info.code,
        title=info.title,
        instructor=info.instructor,
        term=info.term,
        color=color,
        syllabus_text=syllabus_text,
    )
    session.add(course)
    session.commit()
    session.refresh(course)
    for item in info.events:
        session.add(Event(course_id=course.id, **item.model_dump()))
    session.commit()
    return {"course": course, "events": session.exec(select(Event).where(Event.course_id == course.id)).all()}


@app.get("/api/courses", response_model=list[Course])
def list_courses(user: UserDep, session: SessionDep):
    return session.exec(
        select(Course).where(Course.user_id == user.id).order_by(Course.created_at.desc())
    ).all()


@app.get("/api/courses/{course_id}", response_model=Course)
def get_course(course_id: int, user: UserDep, session: SessionDep):
    return owned_course_or_404(course_id, user, session)


@app.delete("/api/courses/{course_id}", status_code=204)
def delete_course(course_id: int, user: UserDep, session: SessionDep):
    course = owned_course_or_404(course_id, user, session)
    for event in session.exec(select(Event).where(Event.course_id == course_id)).all():
        session.delete(event)
    session.delete(course)
    session.commit()


@app.get("/api/events", response_model=list[Event])
def list_events(user: UserDep, course_id: Optional[int] = None, session: Session = Depends(get_session)):
    if course_id is not None:
        owned_course_or_404(course_id, user, session)
        return session.exec(select(Event).where(Event.course_id == course_id).order_by(Event.due_date)).all()
    course_ids = user_course_ids(user, session)
    if not course_ids:
        return []
    return session.exec(select(Event).where(Event.course_id.in_(course_ids)).order_by(Event.due_date)).all()


@app.post("/api/events", response_model=Event, status_code=201)
def create_event(payload: EventCreate, user: UserDep, session: SessionDep):
    owned_course_or_404(payload.course_id, user, session)
    event = Event(**payload.model_dump())
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


@app.patch("/api/events/{event_id}", response_model=Event)
def update_event(event_id: int, payload: EventUpdate, user: UserDep, session: SessionDep):
    event = owned_event_or_404(event_id, user, session)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


@app.delete("/api/events/{event_id}", status_code=204)
def delete_event(event_id: int, user: UserDep, session: SessionDep):
    event = owned_event_or_404(event_id, user, session)
    session.delete(event)
    session.commit()


def ics_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@app.get("/api/events/export.ics")
def export_ics(user: UserDep, session: SessionDep):
    course_ids = user_course_ids(user, session)
    courses = {
        course.id: course
        for course in session.exec(select(Course).where(Course.user_id == user.id)).all()
    }
    events = (
        session.exec(select(Event).where(Event.course_id.in_(course_ids)).order_by(Event.due_date)).all()
        if course_ids
        else []
    )
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SyllabusSync//EN", "CALSCALE:GREGORIAN"]
    for event in events:
        course = courses.get(event.course_id)
        code = course.code if course else "Course"
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{event.id}-{uuid4()}@syllabussync",
                f"DTSTART;VALUE=DATE:{event.due_date.strftime('%Y%m%d')}",
                f"DTEND;VALUE=DATE:{event.due_date.strftime('%Y%m%d')}",
                f"SUMMARY:{ics_escape(event.title)}",
                f"DESCRIPTION:{ics_escape(code)}",
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    return Response(
        "\r\n".join(lines) + "\r\n",
        media_type="text/calendar",
        headers={"Content-Disposition": "attachment; filename=syllabussync.ics"},
    )


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, user: UserDep, session: SessionDep):
    course = owned_course_or_404(payload.course_id, user, session)
    client = require_client()
    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=(
                f"COURSE: {course.code} — {course.title}\n\n"
                f"SYLLABUS:\n{course.syllabus_text[:120_000]}\n\n"
                f"QUESTION: {payload.prompt}"
            ),
            config=types.GenerateContentConfig(
                system_instruction="Answer only from the supplied syllabus. If the syllabus does not answer the question, say so plainly. Be concise.",
            ),
        )
        if not response.text:
            raise ValueError("No response generated")
        return ChatResponse(answer=response.text)
    except Exception as exc:
        logger.exception("Syllabus Q&A failed")
        raise HTTPException(502, "Syllabus Q&A failed. Check the Gemini configuration and try again.") from exc
