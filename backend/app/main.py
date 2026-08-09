import io
import logging
from datetime import date, datetime
from enum import Enum
from typing import Optional
from uuid import uuid4

import pdfplumber
from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from google import genai
from google.genai import types
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlmodel import Field as SQLField, Session, SQLModel, create_engine, select


logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite:///./syllabussync.db"
    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-3.5-flash-lite"


settings = Settings()
engine = create_engine(settings.database_url, connect_args={"check_same_thread": False})


class EventType(str, Enum):
    assignment = "assignment"
    exam = "exam"
    quiz = "quiz"
    reading = "reading"
    other = "other"


class TaskStatus(str, Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class Course(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    code: str
    title: str
    instructor: Optional[str] = None
    term: Optional[str] = None
    color: str = "#6366f1"
    syllabus_text: str
    created_at: datetime = SQLField(default_factory=datetime.utcnow)


class Event(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    course_id: int = SQLField(foreign_key="course.id", index=True)
    title: str
    due_date: date
    event_type: EventType = EventType.assignment
    grade_weight: Optional[float] = None
    notes: Optional[str] = None
    status: TaskStatus = TaskStatus.todo


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


app = FastAPI(title="SyllabusSync API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def create_tables() -> None:
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


def require_client() -> genai.Client:
    if not settings.gemini_api_key:
        raise HTTPException(503, "GEMINI_API_KEY is not configured on the server.")
    return genai.Client(api_key=settings.gemini_api_key)


def course_or_404(course_id: int, session: Session) -> Course:
    course = session.get(Course, course_id)
    if not course:
        raise HTTPException(404, "Course not found")
    return course


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/upload", status_code=201)
async def upload_syllabus(file: UploadFile = File(...), session: Session = Depends(get_session)):
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

    palette = ["#6366f1", "#10b981", "#f97316", "#ec4899", "#06b6d4"]
    color = palette[len(session.exec(select(Course)).all()) % len(palette)]
    course = Course(code=info.code, title=info.title, instructor=info.instructor, term=info.term, color=color, syllabus_text=syllabus_text)
    session.add(course)
    session.commit()
    session.refresh(course)
    for item in info.events:
        session.add(Event(course_id=course.id, **item.model_dump()))
    session.commit()
    return {"course": course, "events": session.exec(select(Event).where(Event.course_id == course.id)).all()}


@app.get("/api/courses", response_model=list[Course])
def list_courses(session: Session = Depends(get_session)):
    return session.exec(select(Course).order_by(Course.created_at.desc())).all()


@app.get("/api/courses/{course_id}", response_model=Course)
def get_course(course_id: int, session: Session = Depends(get_session)):
    return course_or_404(course_id, session)


@app.delete("/api/courses/{course_id}", status_code=204)
def delete_course(course_id: int, session: Session = Depends(get_session)):
    course = course_or_404(course_id, session)
    for event in session.exec(select(Event).where(Event.course_id == course_id)).all():
        session.delete(event)
    session.delete(course)
    session.commit()


@app.get("/api/events", response_model=list[Event])
def list_events(course_id: Optional[int] = None, session: Session = Depends(get_session)):
    query = select(Event).order_by(Event.due_date)
    if course_id is not None:
        query = query.where(Event.course_id == course_id)
    return session.exec(query).all()


@app.post("/api/events", response_model=Event, status_code=201)
def create_event(payload: EventCreate, session: Session = Depends(get_session)):
    course_or_404(payload.course_id, session)
    event = Event(**payload.model_dump())
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


@app.patch("/api/events/{event_id}", response_model=Event)
def update_event(event_id: int, payload: EventUpdate, session: Session = Depends(get_session)):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    session.add(event)
    session.commit()
    session.refresh(event)
    return event


@app.delete("/api/events/{event_id}", status_code=204)
def delete_event(event_id: int, session: Session = Depends(get_session)):
    event = session.get(Event, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    session.delete(event)
    session.commit()


def ics_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@app.get("/api/events/export.ics")
def export_ics(session: Session = Depends(get_session)):
    events = session.exec(select(Event).order_by(Event.due_date)).all()
    courses = {course.id: course for course in session.exec(select(Course)).all()}
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//SyllabusSync//EN", "CALSCALE:GREGORIAN"]
    for event in events:
        lines.extend(["BEGIN:VEVENT", f"UID:{event.id}-{uuid4()}@syllabussync", f"DTSTART;VALUE=DATE:{event.due_date.strftime('%Y%m%d')}", f"DTEND;VALUE=DATE:{event.due_date.strftime('%Y%m%d')}", f"SUMMARY:{ics_escape(event.title)}", f"DESCRIPTION:{ics_escape(courses[event.course_id].code)}", "END:VEVENT"])
    lines.append("END:VCALENDAR")
    return Response("\r\n".join(lines) + "\r\n", media_type="text/calendar", headers={"Content-Disposition": "attachment; filename=syllabussync.ics"})


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, session: Session = Depends(get_session)):
    course = course_or_404(payload.course_id, session)
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
