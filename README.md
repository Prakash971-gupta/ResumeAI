# Resume Screening AI

An AI-powered full-stack resume screening and candidate ranking application with support for **External Databases (MySQL, Cloud DBs, TiDB, Aiven, Railway, AWS RDS)** and automatic **Local SQLite Fallback**.

---

## 🌟 Key Features

- **Multi-Factor AI Scoring**: Evaluates candidate resumes against position criteria based on core skills, experience, and completeness.
- **External & Cloud Database Integration**: Supports remote MySQL, TiDB Cloud, Aiven, Railway, AWS RDS, or any MySQL-compatible cloud database via connection URI (`DATABASE_URL`) or individual credentials (`DB_HOST`, `DB_USER`, `DB_NAME`, etc.).
- **Zero-Setup Local SQLite Fallback**: If external database credentials are not provided or if the remote database is temporarily unreachable, the app automatically switches to local SQLite (`database/resumes.db`) so your workflow is never interrupted.
- **Live Database Connection Status**: Real-time header badge displays whether you are connected to an external cloud database or running locally.
- **Document Support**: Parses `.pdf`, `.docx`, `.doc`, `.txt`, and `.md` resumes.
- **Interactive UI**: Candidate rankings, circular score gauges, matched/missing skill tags, and full evaluation reports.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Database
To connect to an **external MySQL database** (Local MySQL, MySQL Workbench, TiDB Cloud, Aiven, Railway, AWS RDS, etc.):

#### Step A: Configure `.env`
Edit or verify `.env` in the root folder:
```env
PORT=4000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=resumes_db
DB_SSL=false
```
*(Or use `DATABASE_URL=mysql://user:pass@host:3306/resumes_db`)*

#### Step B: Create & Initialize the Database in External MySQL
You can initialize the database using any external MySQL client:
- **Using MySQL CLI**:
  ```bash
  mysql -u root -p < database/schema.sql
  ```
- **Using MySQL Workbench / phpMyAdmin / DBeaver**:
  1. Open [schema.sql](file:///d:/ResumeScreeningAI%20-%20Copy/database/schema.sql).
  2. Paste and run the query to create `resumes_db` and all tables.

#### Step C: View Output in External MySQL
Whenever resumes are screened in the application, results are immediately stored in MySQL. You can view them with:
```sql
USE resumes_db;

-- View all screened resumes with AI scores
SELECT id, name, email, job_title, score, skills_score, experience_score, uploaded_at 
FROM resumes 
ORDER BY score DESC;

-- View job listings & candidate counts
SELECT j.title, COUNT(r.id) AS applicants, AVG(r.score) AS avg_score 
FROM job_description j 
LEFT JOIN resumes r ON j.id = r.job_id 
GROUP BY j.id;
```

> **Note:** If no external DB credentials are provided or MySQL is offline, the app automatically falls back to local SQLite (`database/resumes.db`).

### 3. Start the Application
```bash
npm start
```

### 4. Open in Browser
Visit `http://localhost:4000` or `http://localhost:4000/dashboard.html` in your web browser.

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/db-status` | Get real-time database connection status |
| `GET` | `/api/health` | Service and database health check |
| `GET` | `/api/jobs` | Retrieve all job openings |
| `POST` | `/api/jobs` | Create a new job opening |
| `DELETE` | `/api/jobs/:id` | Delete a job opening |
| `POST` | `/api/upload` | Upload & screen candidate resume against a job |
| `GET` | `/api/resumes` | Search, filter, and list candidate screening evaluations |
| `GET` | `/api/resumes/stats` | Summary statistics (total screened, average & top scores) |
| `GET` | `/api/resume/:id` | Retrieve single candidate breakdown report |
| `DELETE` | `/api/resume/:id` | Delete candidate screening record & file |

---

## 📁 Project Structure

```
├── backend/
│   ├── db.js             # Unified database manager (External MySQL + Local SQLite)
│   └── server.js         # Express server, resume parser, and REST API
├── database/             # SQLite database file directory (resumes.db)
├── frontend/             # Frontend UI (Dashboard, Upload, Results, Jobs, Login)
│   ├── dashboard.html    # Recruitment KPI analytics and recent screenings
│   ├── upload.html       # Resume upload and instant AI analysis
│   ├── result.html       # Candidate search and ranking directory
│   ├── jobs.html         # Job opening position management
│   ├── style.css         # Styling with dark theme and glassmorphism
│   └── script.js         # Client-side UI logic and live status monitoring
├── uploads/              # Uploaded candidate resume files
├── .env.example          # Template with cloud DB configuration examples
├── package.json          # Project manifest and scripts
└── README.md             # Project documentation
```
