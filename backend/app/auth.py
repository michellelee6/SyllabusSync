from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from .models import User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: Optional[str] = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=1)


class AuthUser(BaseModel):
    id: int
    email: str
    name: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUser


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user_id: int, secret: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(user_id), "exp": expire}, secret, algorithm=ALGORITHM)


def user_to_auth(user: User) -> AuthUser:
    return AuthUser(id=user.id, email=user.email, name=user.name)


def issue_token(user: User, secret: str) -> TokenResponse:
    return TokenResponse(access_token=create_access_token(user.id, secret), user=user_to_auth(user))


def get_user_by_email(session: Session, email: str) -> Optional[User]:
    return session.exec(select(User).where(User.email == email.lower())).first()


def register_user(session: Session, payload: RegisterRequest, secret: str) -> TokenResponse:
    email = payload.email.lower()
    if get_user_by_email(session, email):
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists.")
    user = User(
        email=email,
        name=(payload.name or "").strip() or None,
        password_hash=hash_password(payload.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return issue_token(user, secret)


def login_user(session: Session, payload: LoginRequest, secret: str) -> TokenResponse:
    user = get_user_by_email(session, payload.email.lower())
    if not user or not user.password_hash or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password.")
    return issue_token(user, secret)


def google_sign_in(session: Session, credential: str, client_id: Optional[str], secret: str) -> TokenResponse:
    if not client_id:
        raise HTTPException(503, "Google sign-in is not configured on the server.")
    try:
        claims = google_id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id,
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid Google credential.") from exc

    email = (claims.get("email") or "").lower()
    if not email or not claims.get("email_verified", False):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Google account email is not verified.")

    user = get_user_by_email(session, email)
    if not user:
        user = User(
            email=email,
            name=claims.get("name"),
            google_sub=claims.get("sub"),
            password_hash=None,
        )
        session.add(user)
    else:
        if not user.google_sub:
            user.google_sub = claims.get("sub")
        if not user.name and claims.get("name"):
            user.name = claims.get("name")
        session.add(user)
    session.commit()
    session.refresh(user)
    return issue_token(user, secret)


def resolve_user(
    credentials: Optional[HTTPAuthorizationCredentials],
    session: Session,
    secret: str,
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in required.")
    try:
        payload = jwt.decode(credentials.credentials, secret, algorithms=[ALGORITHM])
        user_id = int(payload.get("sub", ""))
    except (JWTError, ValueError, TypeError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session.") from exc

    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired session.")
    return user
