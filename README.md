# Resume Screening AI

A simple full-stack resume screening web app with:
- Frontend: HTML/CSS/JavaScript pages for login, upload, dashboard, and results
- Backend: Node.js + Express API for job list retrieval, resume upload, and scoring
- Database: SQLite storage for uploaded resumes and job descriptions

## Setup

1. Install Node.js and npm.
2. From the project root, run:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open `http://localhost:4000/upload.html` in your browser.

## Features

- Upload a plain text resume (`.txt`) and select a job.
- The backend evaluates keyword matches and assigns a score.
- Results are stored and displayed in the results page.

## Files

- `backend/server.js` - Express server and SQLite database setup
- `frontend/*.html` - UI pages
- `frontend/script.js` - client-side page behavior
- `frontend/style.css` - styling
- `frontend/resume.sql` - database schema SQL
- `package.json` - project manifest

## Notes

- The app currently supports plain text resume uploads (`.txt`).
- The database file is created automatically under `database/resumes.db`.
