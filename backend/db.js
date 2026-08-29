const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment configuration from .env if not already loaded
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
  dotenv.config({ path: resolvedEnvPath });
} else {
  dotenv.config();
}

const mysql = require('mysql2/promise');

// Helper to determine if a value is an unconfigured placeholder
function isPlaceholder(value) {
  if (!value || typeof value !== 'string') return true;
  const trimmed = value.trim();
  return /YOUR_|REPLACE_ME|<.*>|changeme|example\.com/i.test(trimmed) || trimmed === '';
}

// Extract database configuration from environment
function getDatabaseConfig() {
  const databaseUrl = process.env.DATABASE_URL || process.env.DB_URL;
  if (databaseUrl && !isPlaceholder(databaseUrl)) {
    try {
      const parsed = new URL(databaseUrl);
      const isSsl = parsed.searchParams.get('ssl') === 'true' || parsed.searchParams.get('sslmode') === 'require' || process.env.DB_SSL === 'true';
      return {
        isExternal: true,
        source: 'DATABASE_URL',
        host: parsed.hostname,
        port: Number(parsed.port || 3306),
        user: decodeURIComponent(parsed.username || ''),
        password: decodeURIComponent(parsed.password || ''),
        database: (parsed.pathname || '').replace(/^\//, ''),
        ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      };
    } catch (e) {
      console.warn('[Database] Could not parse DATABASE_URL, trying individual DB_* variables:', e.message);
    }
  }

  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const database = process.env.DB_NAME;
  const password = process.env.DB_PASSWORD || process.env.DB_PASS || '';
  const port = Number(process.env.DB_PORT || 3306);
  const ssl = process.env.DB_SSL === 'true' || process.env.DB_SSL === '1' ? { rejectUnauthorized: false } : undefined;

  const hasConfig = host && user && database && !isPlaceholder(host) && !isPlaceholder(user) && !isPlaceholder(database);

  if (hasConfig) {
    return {
      isExternal: true,
      source: 'DB_HOST',
      host,
      port,
      user,
      password,
      database,
      ssl,
    };
  }

  return { isExternal: false };
}

class DatabaseManager {
  constructor() {
    this.type = 'uninitialized'; // 'mysql' | 'sqlite'
    this.pool = null; // MySQL connection pool
    this.sqliteDb = null; // SQLite instance
    this.status = {
      connected: false,
      type: 'none',
      host: 'none',
      database: 'none',
      mode: 'uninitialized',
      error: null,
    };
  }

  async initialize() {
    const config = getDatabaseConfig();

    if (config.isExternal) {
      try {
        console.log(`[Database] Attempting connection to external MySQL database at ${config.host}:${config.port}/${config.database}...`);
        this.pool = mysql.createPool({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
          ssl: config.ssl,
          connectTimeout: 10000,
        });

        // Test connection
        const connection = await this.pool.getConnection();
        connection.release();

        this.type = 'mysql';
        this.status = {
          connected: true,
          type: 'mysql',
          host: config.host,
          port: config.port,
          database: config.database,
          mode: 'external',
          error: null,
        };

        console.log(`[Database] Successfully connected to external MySQL database (${config.host}:${config.port}/${config.database})`);
        await this.migrateSchema();
        return;
      } catch (err) {
        console.error(`[Database] Failed to connect to external MySQL database (${config.host}):`, err.message);
        console.warn('[Database] Falling back to local SQLite database so the application remains operational.');
        this.status.error = `External DB connection failed: ${err.message}`;
      }
    } else {
      console.log('[Database] No external database credentials configured in .env. Using local SQLite database.');
    }

    // Fallback to SQLite
    await this.initSqlite();
    await this.migrateSchema();
  }

  async initSqlite() {
    const dbDir = path.resolve(__dirname, '../database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, 'resumes.db');

    return new Promise((resolve, reject) => {
      this.sqliteDb = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('[Database] Failed to initialize SQLite database:', err.message);
          this.status = {
            connected: false,
            type: 'sqlite',
            host: 'local',
            database: dbPath,
            mode: 'local-fallback',
            error: err.message,
          };
          return reject(err);
        }

        this.type = 'sqlite';
        this.status = {
          connected: true,
          type: 'sqlite',
          host: 'local',
          database: 'resumes.db',
          mode: this.status.error ? 'local-fallback' : 'local',
          error: this.status.error || null,
        };
        console.log(`[Database] Local SQLite database active at ${dbPath}`);
        resolve();
      });
    });
  }

  async migrateSchema() {
    if (this.type === 'mysql') {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS job_description (
          id INT PRIMARY KEY AUTO_INCREMENT,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          required_skills TEXT NOT NULL,
          min_experience INT DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS resumes (
          id INT PRIMARY KEY AUTO_INCREMENT,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) NOT NULL,
          job_id INT,
          job_title VARCHAR(255),
          score INT NOT NULL DEFAULT 0,
          skills_score INT DEFAULT 0,
          experience_score INT DEFAULT 0,
          keywords TEXT,
          missing_keywords TEXT,
          summary TEXT,
          file_path TEXT,
          file_type VARCHAR(50),
          uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Ensure all columns in resumes are automatically added/updated if table was pre-existing
      const resumeCols = [
        ['name', 'VARCHAR(255) DEFAULT \'\''],
        ['email', 'VARCHAR(255) DEFAULT \'\''],
        ['job_id', 'INT'],
        ['job_title', 'VARCHAR(255)'],
        ['score', 'INT NOT NULL DEFAULT 0'],
        ['skills_score', 'INT DEFAULT 0'],
        ['experience_score', 'INT DEFAULT 0'],
        ['keywords', 'TEXT'],
        ['missing_keywords', 'TEXT'],
        ['summary', 'TEXT'],
        ['file_path', 'VARCHAR(500)'],
        ['file_type', 'VARCHAR(50)'],
      ];
      for (const [col, type] of resumeCols) {
        try {
          await this.pool.query(`ALTER TABLE resumes ADD COLUMN ${col} ${type}`);
        } catch (e) {
          // Column already exists or other harmless error
        }
      }
      try {
        await this.pool.query(`ALTER TABLE resumes MODIFY COLUMN file_name VARCHAR(255) NULL`);
      } catch (e) { }

      // Seed initial jobs if table is empty
      const [rows] = await this.pool.query('SELECT COUNT(*) AS count FROM job_description');
      if (Number(rows[0].count) === 0) {
        const seedJobs = [
          ['Software Engineer', 'Develop full-stack web applications, APIs, and scalable infrastructure.', 'javascript, node, express, react, sql, git, rest api', 2],
          ['Frontend Web Developer', 'Craft responsive, intuitive user interfaces and modern web applications.', 'html, css, javascript, react, tailwind, typescript, ui/ux', 1],
          ['Data Scientist & AI Specialist', 'Build predictive models, machine learning pipelines, and analyze complex datasets.', 'python, machine learning, sql, pandas, tensorflow, data analysis, ai', 3],
          ['Backend Systems Engineer', 'Design microservices, optimize database queries, and maintain cloud backend services.', 'node, python, express, postgresql, docker, redis, aws, rest api', 3],
        ];
        await this.pool.query(
          'INSERT INTO job_description (title, description, required_skills, min_experience) VALUES ?',
          [seedJobs]
        );
        console.log('[Database] Seeded initial job descriptions in MySQL database.');
      }

    } else if (this.type === 'sqlite') {
      await this.runSqlite(`
        CREATE TABLE IF NOT EXISTS job_description (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          description TEXT,
          required_skills TEXT NOT NULL,
          min_experience INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await this.runSqlite(`
        CREATE TABLE IF NOT EXISTS resumes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          job_id INTEGER,
          job_title TEXT,
          score INTEGER NOT NULL,
          skills_score INTEGER DEFAULT 0,
          experience_score INTEGER DEFAULT 0,
          keywords TEXT,
          missing_keywords TEXT,
          summary TEXT,
          file_path TEXT,
          file_type TEXT,
          uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      const countResult = await this.getSqlite('SELECT COUNT(*) AS count FROM job_description');
      if (Number(countResult?.count || 0) === 0) {
        const seedJobs = [
          ['Software Engineer', 'Develop full-stack web applications, APIs, and scalable infrastructure.', 'javascript, node, express, react, sql, git, rest api', 2],
          ['Frontend Web Developer', 'Craft responsive, intuitive user interfaces and modern web applications.', 'html, css, javascript, react, tailwind, typescript, ui/ux', 1],
          ['Data Scientist & AI Specialist', 'Build predictive models, machine learning pipelines, and analyze complex datasets.', 'python, machine learning, sql, pandas, tensorflow, data analysis, ai', 3],
          ['Backend Systems Engineer', 'Design microservices, optimize database queries, and maintain cloud backend services.', 'node, python, express, postgresql, docker, redis, aws, rest api', 3],
        ];

        for (const job of seedJobs) {
          await this.runSqlite(
            'INSERT INTO job_description (title, description, required_skills, min_experience) VALUES (?, ?, ?, ?)',
            job
          );
        }
        console.log('[Database] Seeded initial job descriptions in SQLite database.');
      }
    }
  }

  // Unified Query Method
  async query(sql, params = []) {
    if (!this.status.connected) {
      throw new Error(`Database is not connected. ${this.status.error || ''}`);
    }

    if (this.type === 'mysql') {
      const [rows, fields] = await this.pool.query(sql, params);
      // If it's an INSERT/UPDATE result, normalize result format
      if (rows && typeof rows.insertId !== 'undefined') {
        return { insertId: rows.insertId, affectedRows: rows.affectedRows, rows: [] };
      }
      return { rows: Array.isArray(rows) ? rows : [], insertId: rows?.insertId, affectedRows: rows?.affectedRows };
    }

    if (this.type === 'sqlite') {
      const trimmed = sql.trim().toUpperCase();
      if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA')) {
        const rows = await this.allSqlite(sql, params);
        return { rows, insertId: null, affectedRows: 0 };
      } else {
        const result = await this.runSqlite(sql, params);
        return { rows: [], insertId: result.lastID, affectedRows: result.changes };
      }
    }

    throw new Error('Database type unrecognized or uninitialized.');
  }

  runSqlite(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.sqliteDb.run(sql, params, function (err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  getSqlite(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.sqliteDb.get(sql, params, (err, row) => {
        if (err) return reject(err);
        resolve(row);
      });
    });
  }

  allSqlite(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.sqliteDb.all(sql, params, (err, rows) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  getStatus() {
    return {
      ...this.status,
      timestamp: new Date().toISOString(),
    };
  }
}

const db = new DatabaseManager();

module.exports = db;
