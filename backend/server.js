const fs = require('fs');
const path = require('path');

// Load environment configuration from .env if available
const envCandidates = [
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../.env/.env'),
];
const resolvedEnvPath = envCandidates.find((candidate) => {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  } catch (error) {
    return false;
  }
});

if (resolvedEnvPath) {
  require('dotenv').config({ path: resolvedEnvPath });
} else {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Configure Multer for File Uploads
const uploadFolder = path.join(__dirname, '../uploads');
fs.mkdirSync(uploadFolder, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadFolder,
    filename: (req, file, callback) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
      callback(null, `${Date.now()}-${safeName}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

// Helper: Extract text from PDF, DOCX, DOC, or TXT
async function extractTextFromFile(filePath, originalName) {
  try {
    const extension = path.extname(originalName).toLowerCase();
    if (extension === '.pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const parsed = await pdfParse(dataBuffer);
      return parsed.text || '';
    }
    if (extension === '.docx' || extension === '.doc') {
      const parsed = await mammoth.extractRawText({ path: filePath });
      return parsed.value || '';
    }
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Error extracting text from ${originalName}:`, error.message);
    return '';
  }
}

// Synonyms map for skill keyword matching
const synonyms = {
  js: ['javascript', 'js'],
  javascript: ['javascript', 'js'],
  react: ['react', 'reactjs', 'react.js'],
  node: ['node', 'nodejs', 'node.js'],
  express: ['express', 'expressjs', 'express.js'],
  py: ['python', 'py'],
  python: ['python', 'py'],
  sql: ['sql', 'sqlite', 'postgresql', 'postgres', 'mysql', 'mariadb'],
  mysql: ['mysql', 'mariadb', 'sql'],
  postgres: ['postgres', 'postgresql', 'sql'],
  postgresql: ['postgres', 'postgresql', 'sql'],
  css: ['css', 'css3', 'styles', 'tailwind', 'bootstrap'],
  html: ['html', 'html5'],
  ml: ['machine learning', 'ml', 'ai', 'deep learning'],
  ai: ['artificial intelligence', 'ai', 'machine learning', 'ml'],
  ts: ['typescript', 'ts'],
  typescript: ['typescript', 'ts'],
  git: ['git', 'github', 'gitlab'],
  aws: ['aws', 'amazon web services', 'ec2', 's3', 'lambda', 'cloud'],
  docker: ['docker', 'containers', 'containerization', 'k8s', 'kubernetes'],
};

// AI Resume Scoring Engine
function evaluateResume(text, job) {
  const content = (text || '').toLowerCase();
  const skills = (job.required_skills || '')
    .split(',')
    .map((skill) => skill.trim().toLowerCase())
    .filter(Boolean);

  const matched = skills.filter((skill) => {
    const variants = synonyms[skill] || [skill];
    return variants.some((variant) => content.includes(variant));
  });

  const missing = skills.filter((skill) => !matched.includes(skill));
  const skillsScore = skills.length ? Math.round((matched.length / skills.length) * 100) : 100;

  // Extract Experience
  const experienceMatches = [...content.matchAll(/(\d+)\+?\s*(?:year|yr|years|yrs)/gi)];
  const experience = experienceMatches.reduce((highest, match) => {
    const years = Number(match[1]);
    return years < 40 ? Math.max(highest, years) : highest;
  }, 0);

  const minimum = Number(job.min_experience || 0);
  const experienceScore = minimum === 0 ? 100 : experience >= minimum ? 100 : experience ? Math.round((experience / minimum) * 100) : 65;

  // Completeness & Content Volume
  const words = content.split(/\s+/).filter(Boolean).length;
  const completenessScore = Math.min(100, 85 + (words > 100 ? 10 : 0) + (words > 250 ? 5 : 0));

  // Overall Score (Weighted)
  const score = Math.min(100, Math.round(skillsScore * 0.5 + experienceScore * 0.3 + completenessScore * 0.2));

  // Recommendation Summary
  const summary = score >= 80
    ? `Highly Recommended Candidate (${score}% Match). Strongly matches required skills (${matched.join(', ') || 'N/A'}) and meets experience criteria.`
    : score >= 60
      ? `Qualified Candidate (${score}% Match). Good foundation in ${matched.join(', ') || 'key areas'}. Missing skills: ${missing.join(', ') || 'None'}.`
      : `Needs Further Review (${score}% Match). Candidate lacks several required core skills (${missing.join(', ') || 'N/A'}).`;

  return {
    score,
    skillsScore,
    experienceScore,
    matched: matched.join(', '),
    missing: missing.join(', '),
    summary,
  };
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// Database Status & Health Endpoints
app.get('/api/db-status', (req, res) => {
  res.json(db.getStatus());
});

app.get('/api/health', (req, res) => {
  const status = db.getStatus();
  res.json({
    status: status.connected ? 'ok' : 'degraded',
    database: status,
  });
});

// Job Listings
app.get('/api/jobs', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT j.*, (SELECT COUNT(*) FROM resumes r WHERE r.job_id = j.id) AS applicant_count
      FROM job_description j
      ORDER BY j.id ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching jobs:', error.message);
    res.status(500).json({ error: 'Failed to load jobs.', details: error.message });
  }
});

// Create New Job Opening
app.post('/api/jobs', async (req, res) => {
  const { title, description, required_skills, min_experience } = req.body;
  if (!title || !required_skills) {
    return res.status(400).json({ error: 'Job title and required skills are mandatory.' });
  }

  try {
    const result = await db.query(
      'INSERT INTO job_description (title, description, required_skills, min_experience) VALUES (?, ?, ?, ?)',
      [title.trim(), description ? description.trim() : '', required_skills.trim(), Number(min_experience) || 0]
    );

    res.json({
      id: result.insertId,
      title: title.trim(),
      description: description ? description.trim() : '',
      required_skills: required_skills.trim(),
      min_experience: Number(min_experience) || 0,
      applicant_count: 0,
    });
  } catch (error) {
    console.error('Error adding job position:', error.message);
    res.status(500).json({ error: 'Failed to add job position.', details: error.message });
  }
});

// Delete Job Opening
app.delete('/api/jobs/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM job_description WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Job deleted successfully.' });
  } catch (error) {
    console.error('Error deleting job:', error.message);
    res.status(500).json({ error: 'Failed to delete job.', details: error.message });
  }
});

// Resume Screening & Upload
app.post('/api/upload', upload.single('resumeFile'), async (req, res) => {
  const { name, email, jobId } = req.body;

  if (!name || !email || !jobId || !req.file) {
    return res.status(400).json({ error: 'Name, email, job selection, and resume file are required.' });
  }

  try {
    const jobResult = await db.query('SELECT * FROM job_description WHERE id = ?', [jobId]);
    if (!jobResult.rows.length) {
      return res.status(400).json({ error: 'Selected job was not found.' });
    }

    const job = jobResult.rows[0];
    const text = await extractTextFromFile(req.file.path, req.file.originalname);

    if (!text.trim()) {
      return res.status(400).json({ error: 'Unable to extract text content from uploaded file.' });
    }

    const evaluation = evaluateResume(text, job);
    const fileType = path.extname(req.file.originalname).toUpperCase().replace('.', '') || 'TXT';

    const insertResult = await db.query(
      `INSERT INTO resumes (name, email, job_id, job_title, score, skills_score, experience_score, keywords, missing_keywords, summary, file_path, file_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name.trim(),
        email.trim(),
        jobId,
        job.title,
        evaluation.score,
        evaluation.skillsScore,
        evaluation.experienceScore,
        evaluation.matched,
        evaluation.missing,
        evaluation.summary,
        req.file.path,
        fileType,
      ]
    );

    res.json({
      id: insertResult.insertId,
      name: name.trim(),
      email: email.trim(),
      jobId,
      jobTitle: job.title,
      score: evaluation.score,
      skillsScore: evaluation.skillsScore,
      experienceScore: evaluation.experienceScore,
      keywords: evaluation.matched,
      missingKeywords: evaluation.missing,
      summary: evaluation.summary,
      fileType,
    });
  } catch (error) {
    console.error('Error during resume evaluation and upload:', error.message);
    res.status(500).json({ error: 'Failed to process resume screening.', details: error.message });
  }
});

// Candidate Results List
app.get('/api/resumes', async (req, res) => {
  const { jobId, search, sort } = req.query;
  const selectedSort = String(sort || 'score_desc');
  let query = 'SELECT * FROM resumes WHERE 1=1';
  const params = [];

  if (jobId) {
    query += ' AND job_id = ?';
    params.push(jobId);
  }

  if (search && search.trim()) {
    query += ' AND (name LIKE ? OR email LIKE ? OR keywords LIKE ? OR job_title LIKE ?)';
    const pattern = `%${search.trim()}%`;
    params.push(pattern, pattern, pattern, pattern);
  }

  switch (selectedSort) {
    case 'score_asc':
      query += ' ORDER BY score ASC, uploaded_at DESC';
      break;
    case 'date_asc':
      query += ' ORDER BY uploaded_at ASC';
      break;
    case 'date_desc':
      query += ' ORDER BY uploaded_at DESC';
      break;
    case 'score_desc':
    default:
      query += ' ORDER BY score DESC, uploaded_at DESC';
      break;
  }

  try {
    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching resumes:', error.message);
    res.status(500).json({ error: 'Failed to load candidate list.', details: error.message });
  }
});

// Overall Screening Metrics & Stats
app.get('/api/resumes/stats', async (req, res) => {
  try {
    const resumeStats = await db.query(
      'SELECT COUNT(*) AS total_resumes, COALESCE(AVG(score), 0) AS avg_score, COALESCE(MAX(score), 0) AS top_score FROM resumes'
    );
    const jobStats = await db.query('SELECT COUNT(*) AS total_jobs FROM job_description');

    const firstResumeStat = resumeStats.rows[0] || {};
    const firstJobStat = jobStats.rows[0] || {};

    res.json({
      totalResumes: Number(firstResumeStat.total_resumes || 0),
      avgScore: Math.round(Number(firstResumeStat.avg_score || 0)),
      topScore: Number(firstResumeStat.top_score || 0),
      totalJobs: Number(firstJobStat.total_jobs || 0),
    });
  } catch (error) {
    console.error('Error computing dashboard statistics:', error.message);
    res.status(500).json({ error: 'Failed to compute stats.', details: error.message });
  }
});

// Single Candidate Breakdown
app.get('/api/resume/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM resumes WHERE id = ?', [req.params.id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Candidate resume record not found.' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error loading resume record:', error.message);
    res.status(500).json({ error: 'Failed to load candidate resume.', details: error.message });
  }
});

// Delete Candidate Record
app.delete('/api/resume/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT file_path FROM resumes WHERE id = ?', [req.params.id]);
    if (result.rows[0]?.file_path && fs.existsSync(result.rows[0].file_path)) {
      try {
        fs.unlinkSync(result.rows[0].file_path);
      } catch (e) {
        console.warn('Could not unlink resume file:', e.message);
      }
    }
    await db.query('DELETE FROM resumes WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Record deleted successfully.' });
  } catch (error) {
    console.error('Error deleting candidate record:', error.message);
    res.status(500).json({ error: 'Failed to delete record.', details: error.message });
  }
});

// Fallback to Dashboard for client-side navigation
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
  }
  next();
});

// Server Initialization
async function startServer() {
  try {
    await db.initialize();
  } catch (err) {
    console.error('[Server] Database initialization reported error:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Resume Screening AI backend running on http://localhost:${PORT}`);
    console.log(`📊 Database Mode: ${db.status.mode} (${db.status.type})`);
    if (db.status.mode === 'external') {
      console.log(`🌐 Connected to External Host: ${db.status.host}:${db.status.port}/${db.status.database}`);
    }
    console.log(`=======================================================`);
  });
}

startServer();