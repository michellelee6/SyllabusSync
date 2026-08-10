# SyllabusSync

A full-stack syllabus organizer: upload a PDF, extract dated coursework, manage work on a Kanban board, view it on a calendar, export it as iCalendar, and ask syllabus-grounded questions. Each account only sees its own syllabi.

## Run locally

1. Create and activate a Python environment, then install the API dependencies:

   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env
   # Add GEMINI_API_KEY and a long random JWT_SECRET to .env
   # Optional: add GOOGLE_CLIENT_ID for Google sign-in
   uvicorn app.main:app --reload
   ```

2. In a second terminal, install and launch the web app:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Visit `http://localhost:5173`. API documentation is at `http://localhost:8000/docs`.

## Authentication

- Email/password: `POST /api/auth/register` and `POST /api/auth/login`
- Google: configure an OAuth 2.0 Web client ID in Google Cloud Console, set `GOOGLE_CLIENT_ID` on the API, and add your site origin (and `http://localhost:5173` for local dev) under Authorized JavaScript origins
- Protected routes expect `Authorization: Bearer <token>`
- Courses are scoped to the signed-in user

## API surface

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/google`, `GET /api/auth/me`
- `GET /api/config` — public client config (Google client id when enabled)
- `POST /api/upload` — PDF extraction with `pdfplumber` and Gemini structured output
- `GET /api/courses`, `GET /api/courses/{id}`
- `GET|POST /api/events`, `PATCH|DELETE /api/events/{id}`
- `GET /api/events/export.ics`
- `POST /api/chat`
