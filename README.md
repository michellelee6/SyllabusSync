# SyllabusSync

A full-stack syllabus organizer: upload a PDF, extract dated coursework, manage work on a Kanban board, view it on a calendar, export it as iCalendar, and ask syllabus-grounded questions.

## Run locally

1. Create and activate a Python environment, then install the API dependencies:

   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   cp .env.example .env
   # Add GEMINI_API_KEY to .env (create one at https://aistudio.google.com/app/apikey)
   uvicorn app.main:app --reload
   ```

2. In a second terminal, install and launch the web app:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

Visit `http://localhost:5173`. API documentation is at `http://localhost:8000/docs`.

## API surface

- `POST /api/upload` — PDF extraction with `pdfplumber` and Gemini structured output
- `GET /api/courses`, `GET /api/courses/{id}`
- `GET|POST /api/events`, `PATCH|DELETE /api/events/{id}`
- `GET /api/events/export.ics`
- `POST /api/chat`
