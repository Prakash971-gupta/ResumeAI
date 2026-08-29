-- ========================================================
-- Resume Screening AI - MySQL Database Schema & Seed Data
-- ========================================================
-- Compatible with MySQL 5.7+, MySQL 8.0+, MariaDB, TiDB, 
-- AWS RDS, Aiven, Railway, Supabase, and MySQL Workbench.
-- ========================================================

-- 1. Create Database if not exists
CREATE DATABASE IF NOT EXISTS `resumes_db` 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `resumes_db`;

-- ========================================================
-- 2. Table: job_description
-- Stores job openings, requirements, and required skills
-- ========================================================
CREATE TABLE IF NOT EXISTS `job_description` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `required_skills` TEXT NOT NULL,
    `min_experience` INT NOT NULL DEFAULT 0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- 3. Table: resumes
-- Stores uploaded candidate resumes, parsed data & AI scores
-- ========================================================
CREATE TABLE IF NOT EXISTS `resumes` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL DEFAULT '',
    `email` VARCHAR(255) NOT NULL DEFAULT '',
    `job_id` INT NULL,
    `job_title` VARCHAR(255) NULL,
    `score` INT NOT NULL DEFAULT 0,
    `skills_score` INT NOT NULL DEFAULT 0,
    `experience_score` INT NOT NULL DEFAULT 0,
    `keywords` TEXT NULL,
    `missing_keywords` TEXT NULL,
    `summary` TEXT NULL,
    `file_path` VARCHAR(500) NULL,
    `file_type` VARCHAR(50) NULL,
    `uploaded_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_job_id` (`job_id`),
    INDEX `idx_score` (`score`),
    INDEX `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================================
-- 4. Default Seed Job Openings
-- ========================================================
INSERT INTO `job_description` (`id`, `title`, `description`, `required_skills`, `min_experience`)
VALUES
    (1, 'Software Engineer', 'Develop full-stack web applications, APIs, and scalable infrastructure.', 'javascript, node, express, react, sql, git, rest api', 2),
    (2, 'Frontend Web Developer', 'Craft responsive, intuitive user interfaces and modern web applications.', 'html, css, javascript, react, tailwind, typescript, ui/ux', 1),
    (3, 'Data Scientist & AI Specialist', 'Build predictive models, machine learning pipelines, and analyze complex datasets.', 'python, machine learning, sql, pandas, tensorflow, data analysis, ai', 3),
    (4, 'Backend Systems Engineer', 'Design microservices, optimize database queries, and maintain cloud backend services.', 'node, python, express, postgresql, docker, redis, aws, rest api', 3)
ON DUPLICATE KEY UPDATE 
    `title` = VALUES(`title`),
    `description` = VALUES(`description`),
    `required_skills` = VALUES(`required_skills`),
    `min_experience` = VALUES(`min_experience`);

-- ========================================================
-- 5. Useful Verification & Output Queries for External MySQL
-- ========================================================
-- View all job listings:
-- SELECT * FROM job_description ORDER BY id ASC;

-- View all screened resumes with AI scores:
-- SELECT id, name, email, job_title, score, skills_score, experience_score, uploaded_at FROM resumes ORDER BY score DESC;

-- View top candidate breakdown per job:
-- SELECT job_title, COUNT(*) AS applicants, AVG(score) AS avg_score, MAX(score) AS top_score FROM resumes GROUP BY job_title;
