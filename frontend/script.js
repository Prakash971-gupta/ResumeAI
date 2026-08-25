// Global State
let jobsList = [];
let allCandidates = [];

// Helper: Score Color
function getScoreColor(score) {
  if (score >= 80) return '#10b981'; // Green
  if (score >= 60) return '#f59e0b'; // Amber / Yellow
  return '#ef4444'; // Red
}

// Helper: Render Skill Pills
function renderSkillPills(matchedStr, missingStr) {
  let html = '';
  const matched = matchedStr ? matchedStr.split(',').map(s => s.trim()).filter(Boolean) : [];
  const missing = missingStr ? missingStr.split(',').map(s => s.trim()).filter(Boolean) : [];

  matched.forEach(s => {
    html += `<span class="skill-pill skill-pill-match"><i class="fa-solid fa-check"></i> ${s}</span>`;
  });
  missing.forEach(s => {
    html += `<span class="skill-pill skill-pill-missing"><i class="fa-solid fa-xmark"></i> ${s}</span>`;
  });
  if (matched.length === 0 && missing.length === 0) {
    html = `<span style="color: var(--text-dim); font-size: 0.85rem;">No skills specified</span>`;
  }
  return html;
}

// Helper: Score Circle Gauge SVG
function renderScoreGauge(score) {
  const color = getScoreColor(score);
  const offset = 220 - (220 * score) / 100;
  return `
    <div class="score-circle-container">
      <svg class="score-circle-svg" viewBox="0 0 80 80">
        <circle class="score-circle-bg" cx="40" cy="40" r="35"></circle>
        <circle class="score-circle-bar" cx="40" cy="40" r="35" stroke="${color}" style="stroke-dashoffset: ${offset};"></circle>
      </svg>
      <div class="score-number">${score}%</div>
    </div>
  `;
}

// Load Jobs for Dropdowns
async function loadJobs() {
  const jobSelect = document.getElementById('jobId');
  const jobFilter = document.getElementById('jobFilter');

  try {
    const response = await fetch('/api/jobs');
    if (!response.ok) throw new Error('Failed to load jobs');
    jobsList = await response.json();

    if (jobSelect) {
      jobSelect.innerHTML = '<option value="">-- Select Target Job Position --</option>';
      jobsList.forEach((job) => {
        const option = document.createElement('option');
        option.value = job.id;
        option.textContent = `${job.title} (${job.min_experience}+ yrs exp)`;
        jobSelect.appendChild(option);
      });
    }

    if (jobFilter) {
      jobFilter.innerHTML = '<option value="">All Job Openings</option>';
      jobsList.forEach((job) => {
        const option = document.createElement('option');
        option.value = job.id;
        option.textContent = job.title;
        jobFilter.appendChild(option);
      });
    }
  } catch (error) {
    console.error('Error loading jobs:', error);
  }
}

// Handle Job Preview on Upload Page
function handleJobSelectChange() {
  const jobId = document.getElementById('jobId').value;
  const previewBox = document.getElementById('jobPreviewBox');
  const previewContent = document.getElementById('jobPreviewContent');

  if (!jobId) {
    previewBox.style.display = 'none';
    return;
  }

  const selectedJob = jobsList.find(j => j.id == jobId);
  if (selectedJob) {
    const skills = selectedJob.required_skills.split(',').map(s => s.trim()).filter(Boolean);
    let skillsHtml = skills.map(s => `<span class="skill-pill skill-pill-match">${s}</span>`).join('');
    
    previewContent.innerHTML = `
      <div style="font-weight: 700; font-size: 1rem; color: var(--text-main); margin-bottom: 4px;">${selectedJob.title}</div>
      <div style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 10px;">${selectedJob.description || 'No description provided.'}</div>
      <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 6px;">Required Skills:</div>
      <div>${skillsHtml}</div>
      <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 8px;">Min Experience: <strong>${selectedJob.min_experience} Years</strong></div>
    `;
    previewBox.style.display = 'block';
  }
}

// Handle Drag and Drop / File Input Selection
function handleFileSelected(input) {
  const badge = document.getElementById('fileSelectedBadge');
  const nameDisplay = document.getElementById('fileNameDisplay');
  if (input.files && input.files[0]) {
    nameDisplay.textContent = input.files[0].name;
    badge.style.display = 'inline-flex';
  } else {
    badge.style.display = 'none';
  }
}

// Setup Drag & Drop Listeners
function setupDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('resumeFile');
  if (!dropzone || !fileInput) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length) {
      fileInput.files = files;
      handleFileSelected(fileInput);
    }
  });
}

// Upload & Screen Resume
async function submitResume() {
  const form = document.getElementById('uploadForm');
  const message = document.getElementById('uploadMessage');
  const submitBtn = document.getElementById('submitBtn');
  const previewCard = document.getElementById('evaluationPreviewCard');

  if (!form || !submitBtn) return;

  message.style.display = 'none';
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Extracting & Scoring Resume...';

  const formData = new FormData(form);

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    const result = await response.json();

    if (!response.ok) {
      message.className = 'alert-message alert-error';
      message.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${result.error || 'Upload failed.'}`;
      message.style.display = 'flex';
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Screen & Analyze Resume';
      return;
    }

    // Display Preview Result Card
    document.getElementById('resultCandidateName').textContent = result.name;
    document.getElementById('resultJobTitle').textContent = result.jobTitle;
    document.getElementById('resultScoreNum').textContent = `${result.score}%`;
    document.getElementById('resultSummaryText').textContent = result.summary;

    const scoreBar = document.getElementById('resultScoreCircle');
    const color = getScoreColor(result.score);
    const offset = 220 - (220 * result.score) / 100;
    scoreBar.style.stroke = color;
    scoreBar.style.strokeDashoffset = offset;

    const ratingText = document.getElementById('resultRatingText');
    if (result.score >= 80) ratingText.textContent = 'Highly Recommended Candidate';
    else if (result.score >= 60) ratingText.textContent = 'Qualified Candidate';
    else ratingText.textContent = 'Requires Skills Development';
    ratingText.style.color = color;

    document.getElementById('resultMatchedSkills').innerHTML = renderSkillPills(result.keywords, '');
    document.getElementById('resultMissingSkills').innerHTML = renderSkillPills('', result.missingKeywords);

    previewCard.style.display = 'block';
    message.className = 'alert-message alert-success';
    message.innerHTML = `<i class="fa-solid fa-circle-check"></i> Resume evaluated successfully! Score: ${result.score}%`;
    message.style.display = 'flex';

    form.reset();
    document.getElementById('fileSelectedBadge').style.display = 'none';
    document.getElementById('jobPreviewBox').style.display = 'none';

  } catch (error) {
    message.className = 'alert-message alert-error';
    message.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Upload failed. Network error or invalid server response.';
    message.style.display = 'flex';
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Screen & Analyze Resume';
  }
}

function resetUploadForm() {
  document.getElementById('evaluationPreviewCard').style.display = 'none';
  document.getElementById('uploadMessage').style.display = 'none';
}

// Load Dashboard Analytics Stats
async function loadDashboardStats() {
  const totalResumes = document.getElementById('statTotalResumes');
  const avgScore = document.getElementById('statAvgScore');
  const topScore = document.getElementById('statTopScore');
  const totalJobs = document.getElementById('statTotalJobs');

  if (!totalResumes) return;

  try {
    const res = await fetch('/api/resumes/stats');
    if (res.ok) {
      const stats = await res.json();
      totalResumes.textContent = stats.totalResumes;
      avgScore.textContent = `${stats.avgScore}%`;
      topScore.textContent = `${stats.topScore}%`;
      totalJobs.textContent = stats.totalJobs;
    }
  } catch (e) {
    console.error('Failed to fetch dashboard stats', e);
  }
}

// Load Dashboard Recent Evaluations
async function loadRecentEvaluations() {
  const tbody = document.getElementById('recentEvaluationsBody');
  if (!tbody) return;

  try {
    const response = await fetch('/api/resumes');
    if (!response.ok) throw new Error('Failed to load candidate results');
    const candidates = await response.json();

    if (candidates.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">No candidates evaluated yet. <a href="upload.html" style="color: var(--primary);">Upload the first resume</a></td></tr>`;
      return;
    }

    const recent = candidates.slice(0, 5);
    tbody.innerHTML = '';

    recent.forEach((cand) => {
      const tr = document.createElement('tr');
      const scoreBadgeClass = cand.score >= 80 ? 'badge-success' : cand.score >= 60 ? 'badge-warning' : 'badge-danger';
      const uploadedDate = cand.uploaded_at ? new Date(cand.uploaded_at).toLocaleDateString() : 'Recent';
      
      tr.innerHTML = `
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${cand.name}</div>
          <div style="font-size: 0.8rem; color: var(--text-dim);">${cand.email}</div>
        </td>
        <td><span class="badge badge-neutral">${cand.job_title || 'General'}</span></td>
        <td><span class="badge ${scoreBadgeClass}">${cand.score}% Match</span></td>
        <td><span style="font-size: 0.85rem; color: var(--text-muted);">${cand.skills_score ? cand.skills_score + '%' : 'N/A'}</span></td>
        <td><span class="badge badge-neutral"><i class="fa-solid fa-file"></i> ${cand.file_type || 'TXT'}</span></td>
        <td style="color: var(--text-muted); font-size: 0.85rem;">${uploadedDate}</td>
        <td>
          <button onclick="viewCandidateModal(${cand.id})" class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;">
            <i class="fa-solid fa-eye"></i> Review
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger);">Failed to load recent candidates.</td></tr>`;
  }
}

// Load Candidate Directory for result.html
async function loadResults() {
  const container = document.getElementById('resultsContainer');
  if (!container) return;

  const search = document.getElementById('searchInput') ? document.getElementById('searchInput').value : '';
  const jobId = document.getElementById('jobFilter') ? document.getElementById('jobFilter').value : '';
  const sort = document.getElementById('sortFilter') ? document.getElementById('sortFilter').value : 'score_desc';

  try {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (jobId) params.append('jobId', jobId);
    if (sort) params.append('sort', sort);

    const response = await fetch(`/api/resumes?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to load candidate data');
    allCandidates = await response.json();

    if (allCandidates.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px;" class="glass-card">
          <div style="font-size: 3rem; color: var(--text-dim); margin-bottom: 12px;"><i class="fa-solid fa-user-slash"></i></div>
          <h3 style="font-size: 1.3rem;">No candidates matched your query</h3>
          <p style="color: var(--text-muted); margin-top: 4px;">Try modifying your search keywords or upload new resumes.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = '';
    allCandidates.forEach((cand) => {
      const card = document.createElement('div');
      card.className = 'candidate-card';
      const uploadedDate = cand.uploaded_at ? new Date(cand.uploaded_at).toLocaleDateString() : 'N/A';

      card.innerHTML = `
        <div>
          <div class="candidate-header">
            <div>
              <div class="candidate-name">${cand.name}</div>
              <div class="candidate-role"><i class="fa-solid fa-briefcase"></i> ${cand.job_title || 'Position'}</div>
              <div class="candidate-email"><i class="fa-solid fa-envelope"></i> ${cand.email}</div>
            </div>
            ${renderScoreGauge(cand.score)}
          </div>

          <div class="candidate-details">
            <div class="candidate-skills-block">
              <div class="skills-label">Matched Skills</div>
              <div>${renderSkillPills(cand.keywords, '')}</div>
            </div>

            ${cand.missing_keywords ? `
            <div class="candidate-skills-block" style="margin-top: 10px;">
              <div class="skills-label">Missing Skills</div>
              <div>${renderSkillPills('', cand.missing_keywords)}</div>
            </div>` : ''}
          </div>
        </div>

        <div class="candidate-footer">
          <span style="font-size: 0.8rem; color: var(--text-dim);"><i class="fa-solid fa-calendar"></i> ${uploadedDate}</span>
          <div style="display: flex; gap: 8px;">
            <button onclick="viewCandidateModal(${cand.id})" class="btn btn-secondary" style="padding: 8px 14px; font-size: 0.85rem;">
              <i class="fa-solid fa-magnifying-glass-chart"></i> Report
            </button>
            <button onclick="deleteCandidate(${cand.id})" class="btn btn-danger" style="padding: 8px 12px; font-size: 0.85rem;" title="Delete Record">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

  } catch (error) {
    container.innerHTML = `<p style="color: var(--danger); text-align: center;">Unable to load candidate records.</p>`;
  }
}

function handleFilterChange() {
  loadResults();
}

// Modal View for Detailed Candidate Evaluation Report
async function viewCandidateModal(id) {
  const modal = document.getElementById('candidateModal');
  const modalContent = document.getElementById('modalContent');
  if (!modal || !modalContent) return;

  try {
    const res = await fetch(`/api/resume/${id}`);
    if (!res.ok) throw new Error('Candidate details missing');
    const cand = await res.json();

    const color = getScoreColor(cand.score);

    modalContent.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 20px; margin-bottom: 20px;">
        <div>
          <h2 style="font-size: 1.6rem; font-weight: 800;">${cand.name}</h2>
          <div style="color: var(--primary); font-weight: 600;"><i class="fa-solid fa-briefcase"></i> ${cand.job_title || 'Position'}</div>
          <div style="color: var(--text-muted); font-size: 0.9rem;"><i class="fa-solid fa-envelope"></i> ${cand.email}</div>
        </div>
        ${renderScoreGauge(cand.score)}
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
        <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Skills Match Score</div>
          <div style="font-size: 1.4rem; font-weight: 800; color: ${color};">${cand.skills_score || cand.score}%</div>
        </div>
        <div style="background: rgba(15, 23, 42, 0.6); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Experience Score</div>
          <div style="font-size: 1.4rem; font-weight: 800; color: #a78bfa;">${cand.experience_score || 85}%</div>
        </div>
      </div>

      <div style="margin-bottom: 18px;">
        <h4 style="font-size: 0.95rem; margin-bottom: 8px;"><i class="fa-solid fa-circle-check" style="color: var(--success);"></i> Matched Skills</h4>
        <div>${renderSkillPills(cand.keywords, '')}</div>
      </div>

      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 0.95rem; margin-bottom: 8px;"><i class="fa-solid fa-triangle-exclamation" style="color: var(--warning);"></i> Skill Gaps & Missing Keywords</h4>
        <div>${renderSkillPills('', cand.missing_keywords)}</div>
      </div>

      <div style="background: rgba(99, 102, 241, 0.1); border: 1px solid var(--primary-glow); padding: 16px; border-radius: var(--radius-md); margin-bottom: 20px;">
        <h4 style="font-size: 0.85rem; text-transform: uppercase; color: #a5b4fc; margin-bottom: 6px;"><i class="fa-solid fa-brain"></i> AI Summary & Rationale</h4>
        <p style="font-size: 0.95rem; color: var(--text-main);">${cand.summary || 'Strong candidate alignment with job criteria.'}</p>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 12px;">
        <button onclick="closeModal()" class="btn btn-secondary">Close</button>
        <button onclick="deleteCandidate(${cand.id}); closeModal();" class="btn btn-danger"><i class="fa-solid fa-trash"></i> Delete Candidate</button>
      </div>
    `;

    modal.classList.add('active');
  } catch (e) {
    alert('Failed to load candidate breakdown details.');
  }
}

function closeModal() {
  const modal = document.getElementById('candidateModal');
  if (modal) modal.classList.remove('active');
}

// Delete Candidate
async function deleteCandidate(id) {
  if (!confirm('Are you sure you want to delete this candidate screening record?')) return;
  try {
    const res = await fetch(`/api/resume/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadResults();
      loadRecentEvaluations();
      loadDashboardStats();
    } else {
      alert('Failed to delete candidate record.');
    }
  } catch (e) {
    alert('Network error while deleting record.');
  }
}

// Job Management Functions for jobs.html
async function loadJobsGrid() {
  const container = document.getElementById('jobsGridContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/jobs');
    if (!res.ok) throw new Error('Failed to load jobs');
    const jobs = await res.json();

    if (jobs.length === 0) {
      container.innerHTML = `<div class="glass-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">No active job openings. Post a new job to start screening.</div>`;
      return;
    }

    container.innerHTML = '';
    jobs.forEach(job => {
      const card = document.createElement('div');
      card.className = 'candidate-card';
      const skills = job.required_skills ? job.required_skills.split(',').map(s => `<span class="skill-pill skill-pill-match">${s.trim()}</span>`).join('') : '';

      card.innerHTML = `
        <div>
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px;">
            <div>
              <h3 style="font-size: 1.2rem; font-weight: 700; color: var(--text-main);">${job.title}</h3>
              <span class="badge badge-neutral" style="margin-top: 4px;"><i class="fa-solid fa-user-group"></i> ${job.applicant_count || 0} Candidates Screened</span>
            </div>
            <span class="badge badge-success">${job.min_experience}+ Yrs Exp</span>
          </div>

          <p style="font-size: 0.9rem; color: var(--text-muted); margin-bottom: 16px;">${job.description || 'No description provided.'}</p>

          <div style="margin-bottom: 16px;">
            <div class="skills-label">Required Skills</div>
            <div>${skills}</div>
          </div>
        </div>

        <div class="candidate-footer">
          <span style="font-size: 0.8rem; color: var(--text-dim);">Job ID #${job.id}</span>
          <button onclick="deleteJob(${job.id})" class="btn btn-danger" style="padding: 6px 12px; font-size: 0.8rem;">
            <i class="fa-solid fa-trash"></i> Delete Position
          </button>
        </div>
      `;
      container.appendChild(card);
    });

  } catch (e) {
    container.innerHTML = `<p style="color: var(--danger); text-align: center;">Failed to load job listings.</p>`;
  }
}

function openCreateJobModal() {
  const modal = document.getElementById('jobModal');
  if (modal) modal.classList.add('active');
}

function closeJobModal() {
  const modal = document.getElementById('jobModal');
  if (modal) modal.classList.remove('active');
}

async function handleCreateJob(event) {
  event.preventDefault();
  const title = document.getElementById('jobTitleInput').value;
  const description = document.getElementById('jobDescInput').value;
  const required_skills = document.getElementById('jobSkillsInput').value;
  const min_experience = document.getElementById('jobExpInput').value;
  const msg = document.getElementById('jobModalMessage');

  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, required_skills, min_experience }),
    });

    if (!res.ok) {
      const data = await res.json();
      msg.className = 'alert-message alert-error';
      msg.textContent = data.error || 'Failed to save job position.';
      msg.style.display = 'flex';
      return;
    }

    closeJobModal();
    document.getElementById('createJobForm').reset();
    loadJobsGrid();
    loadJobs();
  } catch (e) {
    msg.className = 'alert-message alert-error';
    msg.textContent = 'Error adding job.';
    msg.style.display = 'flex';
  }
}

async function deleteJob(id) {
  if (!confirm('Are you sure you want to delete this job opening position?')) return;
  try {
    const res = await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
    if (res.ok) {
      loadJobsGrid();
      loadJobs();
    } else {
      alert('Failed to delete job position.');
    }
  } catch (e) {
    alert('Error deleting job position.');
  }
}

// Initializers
document.addEventListener('DOMContentLoaded', () => {
  loadJobs();
  setupDropzone();

  if (document.getElementById('statTotalResumes')) {
    loadDashboardStats();
    loadRecentEvaluations();
  }

  if (document.getElementById('resultsContainer')) {
    loadResults();
  }

  if (document.getElementById('jobsGridContainer')) {
    loadJobsGrid();
  }

  const uploadForm = document.getElementById('uploadForm');
  if (uploadForm) {
    uploadForm.addEventListener('submit', (event) => {
      event.preventDefault();
      submitResume();
    });
  }
});
