const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const uploadFolder = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadFolder)) {
  fs.mkdirSync(uploadFolder, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadFolder);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, `${timestamp}-${safeName}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

const dbFile = path.join(__dirname, '../database/resumes.db');
const dbFolder = path.dirname(dbFile);
if (!fs.existsSync(dbFolder)) {
  fs.mkdirSync(dbFolder, { recursive: true });
}

const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
});

function initializeDatabase() {
  db.serialize(() => {
    // Create job_description table
    db.run(`
      CREATE TABLE IF NOT EXISTS job_description (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        description TEXT,
        required_skills TEXT,
        min_experience INTEGER
      );
    `);

    // Create resumes table
    db.run(`
      CREATE TABLE IF NOT EXISTS resumes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT,
        job_id INTEGER,
        job_title TEXT,
        score INTEGER,
        skills_score INTEGER,
        experience_score INTEGER,
        keywords TEXT,
        missing_keywords TEXT,
        summary TEXT,
        file_path TEXT,
        file_type TEXT,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Safely add missing columns to resumes if DB existed previously
    const alterQueries = [
      'ALTER TABLE resumes ADD COLUMN job_id INTEGER;',
      'ALTER TABLE resumes ADD COLUMN job_title TEXT;',
      'ALTER TABLE resumes ADD COLUMN skills_score INTEGER;',
      'ALTER TABLE resumes ADD COLUMN experience_score INTEGER;',
      'ALTER TABLE resumes ADD COLUMN missing_keywords TEXT;',
      'ALTER TABLE resumes ADD COLUMN summary TEXT;',
      'ALTER TABLE resumes ADD COLUMN file_type TEXT;',
    ];

    alterQueries.forEach((q) => {
      db.run(q, (err) => {
        // Ignore error if column already exists
      });
    });

    // Seed jobs if empty
    db.get('SELECT COUNT(*) as count FROM job_description', (err, row) => {
      if (!err && row && row.count === 0) {
        const seedJobs = [
          {
            title: 'Software Engineer',
            description: 'Develop full-stack web applications, APIs, and scalable infrastructure.',
            required_skills: 'javascript, node, express, react, sql, git, rest api',
            min_experience: 2,
          },
          {
            title: 'Frontend Web Developer',
            description: 'Craft responsive, intuitive user interfaces and modern web applications.',
            required_skills: 'html, css, javascript, react, tailwind, typescript, ui/ux',
            min_experience: 1,
          },
          {
            title: 'Data Scientist & AI Specialist',
            description: 'Build predictive models, machine learning pipelines, and analyze complex datasets.',
            required_skills: 'python, machine learning, sql, pandas, tensorflow, data analysis, ai',
            min_experience: 3,
          },
          {
            title: 'Backend Systems Engineer',
            description: 'Design microservices, optimize database queries, and maintain cloud backend services.',
            required_skills: 'node, python, express, postgresql, docker, redis, aws, rest api',
            min_experience: 3,
          },
        ];

        const stmt = db.prepare(
          'INSERT INTO job_description (title, description, required_skills, min_experience) VALUES (?, ?, ?, ?)'
        );
        seedJobs.forEach((job) => {
          stmt.run(job.title, job.description, job.required_skills, job.min_experience);
        });
        stmt.finalize();
      }
    });
  });
}

initializeDatabase();

// Document Text Extractor supporting PDF, DOCX, and TXT
async function extractTextFromFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  try {
    if (ext === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      return pdfData.text || '';
    } else if (ext === '.docx' || ext === '.doc') {
      const docResult = await mammoth.extractRawText({ path: filePath });
      return docResult.value || '';
    } else {
      // Plain text / MD / fallback
      return fs.readFileSync(filePath, 'utf8');
    }
  } catch (error) {
    console.error(`Error extracting text from ${originalName}:`, error);
    // Fallback attempt text read
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (e) {
      return '';
    }
  }
}

// Synonyms map to expand skill matching
const SYNONYMS = {
  js: ['javascript', 'js'],
  javascript: ['javascript', 'js'],
  react: ['react', 'reactjs', 'react.js'],
  node: ['node', 'nodejs', 'node.js'],
  express: ['express', 'expressjs', 'express.js'],
  py: ['python', 'py'],
  python: ['python', 'py'],
  sql: ['sql', 'sqlite', 'postgresql', 'postgres', 'mysql'],
  css: ['css', 'css3', 'styles'],
  html: ['html', 'html5'],
  ml: ['machine learning', 'ml', 'ai'],
  ts: ['typescript', 'ts'],
  typescript: ['typescript', 'ts'],
};

function evaluateResumeText(text, job) {
  const normalizedText = text.toLowerCase();
  const rawSkills = job.required_skills ? job.required_skills.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  
  const matched = [];
  const missing = [];

  rawSkills.forEach((skill) => {
    const variants = SYNONYMS[skill] || [skill];
    const isMatched = variants.some((v) => normalizedText.includes(v));
    if (isMatched) {
      matched.push(skill);
    } else {
      missing.push(skill);
    }
  });

  // Calculate Skills Score
  const totalSkills = rawSkills.length;
  const skillsScore = totalSkills > 0 ? Math.round((matched.length / totalSkills) * 100) : 100;

  // Extract Experience
  let extractedExp = 0;
  const expRegex = /(\d+)\+?\s*(?:year|yr|years|yrs)/gi;
  let match;
  while ((match = expRegex.exec(normalizedText)) !== null) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num) && num < 40) {
      if (num > extractedExp) extractedExp = num;
    }
  }

  // Calculate Experience Score
  const minExp = job.min_experience || 0;
  let experienceScore = 100;
  if (minExp > 0) {
    if (extractedExp >= minExp) {
      experienceScore = 100;
    } else if (extractedExp > 0) {
      experienceScore = Math.round((extractedExp / minExp) * 100);
    } else {
      // Default baseline if no explicit "X years" phrase found
      experienceScore = 65;
    }
  }

  // Completeness & Formatting Score
  const wordCount = normalizedText.split(/\s+/).filter(Boolean).length;
  let completenessScore = 85;
  if (wordCount > 100) completenessScore += 10;
  if (wordCount > 250) completenessScore += 5;
  completenessScore = Math.min(100, completenessScore);

  // Overall Weighted Score
  const overallScore = Math.round(skillsScore * 0.5 + experienceScore * 0.3 + completenessScore * 0.2);

  // Generate AI Summary Recommendation
  let recommendation = '';
  if (overallScore >= 80) {
    recommendation = `Highly Recommended Candidate (${overallScore}% Match). Strongly matches required skills (${matched.join(', ') || 'N/A'}) and meets experience criteria.`;
  } else if (overallScore >= 60) {
    recommendation = `Qualified Candidate (${overallScore}% Match). Good foundation in ${matched.join(', ') || 'key areas'}. Missing skills: ${missing.join(', ') || 'None'}.`;
  } else {
    recommendation = `Needs Further Review (${overallScore}% Match). Candidate lacks several required core skills (${missing.join(', ')}).`;
  }

  return {
    overallScore,
    skillsScore,
    experienceScore,
    matchedSkills: matched.join(', '),
    missingSkills: missing.join(', '),
    extractedExp,
    summary: recommendation,
  };
}

// API Routes

// Get Jobs with Applicant Counts
app.get('/api/jobs', (req, res) => {
  const query = `
    SELECT j.*, COUNT(r.id) as applicant_count
    FROM job_description j
    LEFT JOIN resumes r ON j.id = r.job_id
    GROUP BY j.id
    ORDER BY j.id ASC
  `;
  db.all(query, (err, rows) => {
    if (err) {
      // Fallback simple query
      db.all('SELECT *, 0 as applicant_count FROM job_description', (e, simpleRows) => {
        if (e) return res.status(500).json({ error: 'Failed to load jobs' });
        res.json(simpleRows);
      });
    } else {
      res.json(rows);
    }
  });
});

// Create New Job
app.post('/api/jobs', (req, res) => {
  const { title, description, required_skills, min_experience } = req.body;
  if (!title || !required_skills) {
    return res.status(400).json({ error: 'Job title and required skills are mandatory.' });
  }

  const stmt = db.prepare(
    'INSERT INTO job_description (title, description, required_skills, min_experience) VALUES (?, ?, ?, ?)'
  );
  stmt.run(title, description || '', required_skills, parseInt(min_experience, 10) || 0, function (err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to add job position.' });
    }
    res.json({
      id: this.lastID,
      title,
      description,
      required_skills,
      min_experience: parseInt(min_experience, 10) || 0,
      applicant_count: 0,
    });
  });
  stmt.finalize();
});

// Delete Job
app.delete('/api/jobs/:id', (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM job_description WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete job.' });
    }
    res.json({ success: true, message: 'Job deleted successfully.' });
  });
});

// Upload and Screen Resume
app.post('/api/upload', upload.single('resumeFile'), async (req, res) => {
  const { name, email, jobId } = req.body;
  const file = req.file;

  if (!name || !email || !jobId || !file) {
    return res.status(400).json({ error: 'Name, email, job selection, and resume file are required.' });
  }

  db.get('SELECT * FROM job_description WHERE id = ?', [jobId], async (err, job) => {
    if (err || !job) {
      return res.status(400).json({ error: 'Selected job was not found.' });
    }

    const text = await extractTextFromFile(file.path, file.originalname);
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Unable to extract text content from uploaded file.' });
    }

    const evalResult = evaluateResumeText(text, job);
    const fileType = path.extname(file.originalname).toUpperCase().replace('.', '');

    const insertSql = `
      INSERT INTO resumes 
      (name, email, job_id, job_title, score, skills_score, experience_score, keywords, missing_keywords, summary, file_path, file_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
      insertSql,
      [
        name,
        email,
        job.id,
        job.title,
        evalResult.overallScore,
        evalResult.skillsScore,
        evalResult.experienceScore,
        evalResult.matchedSkills,
        evalResult.missingSkills,
        evalResult.summary,
        file.path,
        fileType,
      ],
      function (err) {
        if (err) {
          console.error('Database insert error:', err);
          return res.status(500).json({ error: 'Failed to save resume evaluation.' });
        }
        res.json({
          id: this.lastID,
          name,
          email,
          jobId: job.id,
          jobTitle: job.title,
          score: evalResult.overallScore,
          skillsScore: evalResult.skillsScore,
          experienceScore: evalResult.experienceScore,
          keywords: evalResult.matchedSkills,
          missingKeywords: evalResult.missingSkills,
          summary: evalResult.summary,
          fileType,
          uploadedAt: new Date().toISOString(),
        });
      }
    );
  });
});

// Get Resumes with Search & Filter
app.get('/api/resumes', (req, res) => {
  const { jobId, search, sort } = req.query;
  let query = 'SELECT * FROM resumes WHERE 1=1';
  const params = [];

  if (jobId) {
    query += ' AND job_id = ?';
    params.push(jobId);
  }

  if (search) {
    query += ' AND (name LIKE ? OR email LIKE ? OR keywords LIKE ? OR job_title LIKE ?)';
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  if (sort === 'score_asc') {
    query += ' ORDER BY score ASC';
  } else if (sort === 'date_asc') {
    query += ' ORDER BY uploaded_at ASC';
  } else if (sort === 'date_desc') {
    query += ' ORDER BY uploaded_at DESC';
  } else {
    // Default score_desc
    query += ' ORDER BY score DESC, uploaded_at DESC';
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Fetch resumes error:', err);
      return res.status(500).json({ error: 'Failed to load candidate list.' });
    }
    res.json(rows);
  });
});

// Analytics Endpoint
app.get('/api/resumes/stats', (req, res) => {
  db.get(
    `SELECT 
      COUNT(*) as total_resumes,
      COALESCE(AVG(score), 0) as avg_score,
      COALESCE(MAX(score), 0) as top_score
     FROM resumes`,
    (err, resumeStats) => {
      if (err) return res.status(500).json({ error: 'Failed to compute stats' });
      db.get(`SELECT COUNT(*) as total_jobs FROM job_description`, (err2, jobStats) => {
        if (err2) return res.status(500).json({ error: 'Failed to compute job stats' });
        res.json({
          totalResumes: resumeStats ? resumeStats.total_resumes : 0,
          avgScore: Math.round(resumeStats ? resumeStats.avg_score : 0),
          topScore: resumeStats ? resumeStats.top_score : 0,
          totalJobs: jobStats ? jobStats.total_jobs : 0,
        });
      });
    }
  );
});

// Single Resume Detail
app.get('/api/resume/:id', (req, res) => {
  db.get('SELECT * FROM resumes WHERE id = ?', [req.params.id], (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Candidate resume not found.' });
    res.json(row);
  });
});

// Delete Resume
app.delete('/api/resume/:id', (req, res) => {
  db.get('SELECT file_path FROM resumes WHERE id = ?', [req.params.id], (err, row) => {
    if (row && row.file_path && fs.existsSync(row.file_path)) {
      try {
        fs.unlinkSync(row.file_path);
      } catch (e) {}
    }
    db.run('DELETE FROM resumes WHERE id = ?', [req.params.id], function (e) {
      if (e) return res.status(500).json({ error: 'Failed to delete record' });
      res.json({ success: true });
    });
  });
});

// Fallback static route
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
  } else {
    next();
  }
});

app.listen(PORT, () => {
  console.log(`Resume Screening AI backend operational on http://localhost:${PORT}`);
});
