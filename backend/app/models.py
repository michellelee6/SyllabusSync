from datetime import date, datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field as SQLField, SQLModel


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


class User(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    email: str = SQLField(index=True, unique=True)
    name: Optional[str] = None
    password_hash: Optional[str] = None
    google_sub: Optional[str] = SQLField(default=None, index=True)
    created_at: datetime = SQLField(default_factory=datetime.utcnow)


class Course(SQLModel, table=True):
    id: Optional[int] = SQLField(default=None, primary_key=True)
    user_id: int = SQLField(foreign_key="user.id", index=True)
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
