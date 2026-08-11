/* ============================================================
   QUIZHUB — App logic
   ============================================================ */

const App = (() => {
  const root = document.getElementById("app");

  /* ---------------- Utilities ---------------- */

  const TIMING = { noncalc: 50, calc: 80 };

  function uid(prefix = "") {
    return prefix + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  }

  function slugify(...parts) {
    return parts
      .join("_")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function shuffledIndices(n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function grade(pct) {
    if (pct >= 80) return "A1";
    if (pct >= 75) return "B2";
    if (pct >= 70) return "B3";
    if (pct >= 65) return "C4";
    if (pct >= 60) return "C5";
    if (pct >= 55) return "C6";
    if (pct >= 50) return "D7";
    if (pct >= 40) return "E8";
    return "F9";
  }

  function getParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function shareLink(quizId) {
    const url = new URL(window.location.href);
    url.search = `?quiz=${quizId}`;
    url.hash = "";
    return url.toString();
  }

  /* ---------------- Local "session" (no full auth, documented tradeoff) ---------------- */

  const Session = {
    getTeacherName() { return localStorage.getItem("quizhub_teacher") || ""; },
    setTeacherName(name) { localStorage.setItem("quizhub_teacher", name); },
    clearTeacher() { localStorage.removeItem("quizhub_teacher"); }
  };

  /* ---------------- Footer & shell ---------------- */

  function shell(innerHtml, { tagline = "" } = {}) {
    root.innerHTML = `
      <div class="topbar">
        <div class="brand">QUIZHUB <span class="brand-mark">SHS</span></div>
        <div class="tagline">${escapeHtml(tagline)}</div>
      </div>
      ${innerHtml}
      <div class="site-footer">© AssifMan</div>
    `;
  }

  /* ============================================================
     ROUTER
     ============================================================ */

  function route() {
    const quizId = getParam("quiz");
    const hash = window.location.hash.replace("#", "");

    if (quizId) {
      renderStudentEntry(quizId);
    } else if (hash === "teacher") {
      renderTeacherArea();
    } else {
      renderHome();
    }
  }

  window.addEventListener("hashchange", route);

  /* ============================================================
     HOME
     ============================================================ */

  function renderHome() {
    shell(`
      <div class="card wide">
        <p class="eyebrow">Welcome</p>
        <h1 class="card-title">Who's opening QUIZHUB?</h1>
        <p class="subtext">Teachers set up and mark quizzes. Students only need a quiz link shared on WhatsApp — there's nothing to pick here for them.</p>
        <div class="role-grid">
          <div class="role-card">
            <h3>I'm a teacher</h3>
            <p>Generate or upload questions, publish a quiz, and get a link to share with your class.</p>
            <button class="btn btn-primary" onclick="App.goTeacher()">Open teacher dashboard</button>
          </div>
          <div class="role-card">
            <h3>I'm a student</h3>
            <p>Open the quiz link your teacher shared with you on WhatsApp — it will bring you straight here.</p>
            <button class="btn btn-secondary" disabled>Waiting for a quiz link</button>
          </div>
        </div>
      </div>
    `);
  }

  function goTeacher() {
    window.location.hash = "teacher";
  }

  /* ============================================================
     TEACHER AREA
     ============================================================ */

  function renderTeacherArea() {
    const name = Session.getTeacherName();
    if (!name) return renderTeacherLogin();
    renderTeacherDashboard(name);
  }

  function renderTeacherLogin() {
    shell(`
      <div class="card">
        <p class="eyebrow">Teacher access</p>
        <h1 class="card-title">Enter your name</h1>
        <p class="subtext">This is how your quizzes are labelled and filtered on your dashboard. No password needed — keep this device to yourself, or see the setup guide for adding real accounts.</p>
        <div class="field">
          <label for="teacherNameInput">Full name</label>
          <input type="text" id="teacherNameInput" placeholder="e.g. Mr. Kwame Asante" />
        </div>
        <button class="btn btn-primary btn-block" onclick="App.submitTeacherLogin()">Continue</button>
        <p class="small mt-8"><a href="#" onclick="App.goHome();return false;">&larr; Back</a></p>
      </div>
    `);
  }

  function goHome() { window.location.hash = ""; window.history.replaceState({}, "", window.location.pathname); route(); }

  function submitTeacherLogin() {
    const val = document.getElementById("teacherNameInput").value.trim();
    if (!val) return;
    Session.setTeacherName(val);
    renderTeacherArea();
  }

  let teacherQuizzesCache = [];

  function renderTeacherDashboard(name) {
    shell(`
      <div class="card wide">
        <div class="exam-header">
          <div>
            <p class="eyebrow">Teacher dashboard</p>
            <h1 class="card-title">${escapeHtml(name)}</h1>
          </div>
          <div class="btn-row">
            <button class="btn btn-secondary" onclick="App.switchTeacher()">Switch teacher</button>
            <button class="btn btn-primary" onclick="App.renderNewQuizForm()">+ New quiz</button>
          </div>
        </div>
        <div id="quizListWrap"><p class="small">Loading your quizzes…</p></div>
      </div>
    `, { tagline: "Teacher dashboard" });

    db.collection("quizzes").where("teacherName", "==", name)
      .get()
      .then(snap => {
        teacherQuizzesCache = [];
        snap.forEach(doc => teacherQuizzesCache.push({ id: doc.id, ...doc.data() }));
        teacherQuizzesCache.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        renderQuizList();
      })
      .catch(err => {
        document.getElementById("quizListWrap").innerHTML =
          `<div class="alert alert-error">Couldn't load quizzes: ${escapeHtml(err.message)}. Check firebase-config.js is filled in.</div>`;
      });
  }

  function renderQuizList() {
    const wrap = document.getElementById("quizListWrap");
    if (!wrap) return;
    if (teacherQuizzesCache.length === 0) {
      wrap.innerHTML = `<p class="small">No quizzes yet. Click "+ New quiz" to generate your first one.</p>`;
      return;
    }
    const rows = teacherQuizzesCache.map(q => `
      <tr>
        <td>${escapeHtml(q.subject)}<br><span class="small">${escapeHtml(q.topics || "")}</span></td>
        <td>${escapeHtml(q.level)}</td>
        <td>${escapeHtml(q.typeOfWork)} · Wk ${escapeHtml(String(q.week))}</td>
        <td>${(q.questions || []).length}</td>
        <td><span class="badge badge-${q.status}">${q.status}</span></td>
        <td>
          <div class="btn-row">
            ${q.status === "draft" ? `<button class="btn btn-secondary" onclick="App.resumeEdit('${q.id}')">Edit</button>` : ""}
            ${q.status === "published" ? `<button class="btn btn-secondary" onclick="App.showShare('${q.id}')">Share link</button>` : ""}
            <button class="btn btn-secondary" onclick="App.renderResults('${q.id}')">Results</button>
            ${q.status === "published" ? `<button class="btn btn-danger" onclick="App.closeQuiz('${q.id}')">Close</button>` : ""}
          </div>
        </td>
      </tr>
    `).join("");

    wrap.innerHTML = `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Subject / topics</th><th>Level</th><th>Work</th><th>Qs</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function switchTeacher() { Session.clearTeacher(); renderTeacherArea(); }

  function closeQuiz(quizId) {
    if (!confirm("Close this quiz? Students will no longer be able to open the link.")) return;
    db.collection("quizzes").doc(quizId).update({ status: "closed" }).then(() => renderTeacherDashboard(Session.getTeacherName()));
  }

  /* ---------------- New quiz / question builder ---------------- */

  let draftQuiz = null; // { teacherName, subject, topics, level, typeOfWork, week, questions: [] }

  function renderNewQuizForm() {
    draftQuiz = {
      teacherName: Session.getTeacherName(),
      subject: "", topics: "", level: "SHS2", typeOfWork: "Class Test", week: "",
      questions: []
    };
    shell(`
      <div class="card wide">
        <p class="eyebrow">New quiz</p>
        <h1 class="card-title">Set up the quiz</h1>
        <p class="subtext">Fill this in once — QUIZHUB (or you) will supply the questions next.</p>

        <div class="row">
          <div class="field"><label>Subject</label><input type="text" id="f_subject" placeholder="e.g. Economics" /></div>
          <div class="field"><label>Level</label>
            <select id="f_level">
              <option value="SHS1">SHS 1</option>
              <option value="SHS2" selected>SHS 2</option>
              <option value="SHS3">SHS 3</option>
            </select>
          </div>
        </div>
        <div class="field"><label>Topic(s)</label><textarea id="f_topics" placeholder="e.g. Demand and supply, Price elasticity of demand"></textarea></div>
        <div class="row">
          <div class="field"><label>Type of work</label>
            <select id="f_type">
              <option>Class Test</option><option>Quiz</option><option>Assignment</option><option>Mock Exam</option><option>Revision Exercise</option>
            </select>
          </div>
          <div class="field"><label>Week</label><input type="text" id="f_week" placeholder="e.g. Week 6" /></div>
        </div>

        <hr class="divider" />
        <div id="genOrUpload"></div>
      </div>
    `, { tagline: "New quiz" });
    renderGenOrUploadChoice();
  }

  function readQuizMeta() {
    draftQuiz.subject = document.getElementById("f_subject").value.trim();
    draftQuiz.topics = document.getElementById("f_topics").value.trim();
    draftQuiz.level = document.getElementById("f_level").value;
    draftQuiz.typeOfWork = document.getElementById("f_type").value;
    draftQuiz.week = document.getElementById("f_week").value.trim();
  }

  function renderGenOrUploadChoice() {
    const wrap = document.getElementById("genOrUpload");
    wrap.innerHTML = `
      <div class="btn-row">
        <button class="btn btn-primary" onclick="App.startAIGeneration()">✦ Generate questions with AI</button>
        <button class="btn btn-secondary" onclick="App.showUploadForm()">Upload my own questions</button>
      </div>
      <div id="genArea" class="mt-24"></div>
    `;
  }

  function validateMetaOrAlert() {
    readQuizMeta();
    if (!draftQuiz.subject || !draftQuiz.topics || !draftQuiz.week) {
      alert("Please fill in subject, topic(s) and week first.");
      return false;
    }
    return true;
  }

  function startAIGeneration() {
    if (!validateMetaOrAlert()) return;
    const genArea = document.getElementById("genArea");
    genArea.innerHTML = `
      <div class="field" style="max-width:220px">
        <label>How many questions?</label>
        <input type="number" id="f_count" value="15" min="4" max="40" />
      </div>
      <button class="btn btn-primary" onclick="App.runGeneration()">Generate</button>
      <div id="genStatus" class="mt-24"></div>
    `;
  }

  async function runGeneration() {
    readQuizMeta();
    const count = Math.max(4, Math.min(40, Number(document.getElementById("f_count").value) || 15));
    const statusEl = document.getElementById("genStatus");
    statusEl.innerHTML = `<div class="btn-row" style="align-items:center"><span class="spinner dark"></span><span class="small">Generating ${count} questions across DOK 1–4… this can take up to a minute.</span></div>`;
    try {
      const questions = await QuizAI.generate({
        subject: draftQuiz.subject, topics: draftQuiz.topics, level: draftQuiz.level,
        typeOfWork: draftQuiz.typeOfWork, week: draftQuiz.week, count
      });
      draftQuiz.questions = questions;
      statusEl.innerHTML = `<div class="alert alert-success">Generated ${questions.length} questions. Review and edit below, then publish.</div>`;
      renderQuestionEditor();
    } catch (err) {
      statusEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)} <button class="btn btn-secondary mt-8" onclick="App.runGeneration()">Try again</button></div>`;
    }
  }

  function showUploadForm() {
    if (!validateMetaOrAlert()) return;
    const genArea = document.getElementById("genArea");
    genArea.innerHTML = `
      <p class="subtext">Paste a JSON array of questions, each shaped like:</p>
      <pre class="small" style="background:#fff;padding:10px;border-radius:4px;border:1px solid var(--line);overflow:auto">[{"text":"...","options":["A","B","C","D"],"correctIndex":0,"type":"noncalc","dok":2}]</pre>
      <div class="field"><textarea id="f_uploadJson" rows="8" placeholder="Paste JSON here"></textarea></div>
      <button class="btn btn-primary" onclick="App.parseUploadedQuestions()">Load questions</button>
      <p class="small mt-8">Prefer to build questions one at a time instead? <a href="#" onclick="App.addBlankQuestion();return false;">Start with a blank question</a>.</p>
      <div id="genStatus" class="mt-24"></div>
    `;
  }

  function parseUploadedQuestions() {
    const raw = document.getElementById("f_uploadJson").value;
    const statusEl = document.getElementById("genStatus");
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr) || arr.length === 0) throw new Error("Expected a non-empty JSON array.");
      draftQuiz.questions = arr.map((q, i) => ({
        id: `Q${String(i + 1).padStart(2, "0")}-${Math.random().toString(36).slice(2, 7)}`,
        text: String(q.text || "").trim(),
        options: (q.options || ["", "", "", ""]).map(o => String(o)),
        correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0,
        type: q.type === "calc" ? "calc" : "noncalc",
        dok: [1, 2, 3, 4].includes(Number(q.dok)) ? Number(q.dok) : 1
      }));
      statusEl.innerHTML = `<div class="alert alert-success">Loaded ${draftQuiz.questions.length} questions.</div>`;
      renderQuestionEditor();
    } catch (err) {
      statusEl.innerHTML = `<div class="alert alert-error">Couldn't read that JSON: ${escapeHtml(err.message)}</div>`;
    }
  }

  function addBlankQuestion() {
    draftQuiz.questions.push({
      id: uid("Q"), text: "", options: ["", "", "", ""], correctIndex: 0, type: "noncalc", dok: 1
    });
    renderQuestionEditor();
  }

  function renderQuestionEditor() {
    let host = document.getElementById("questionEditorHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "questionEditorHost";
      host.className = "mt-24";
      document.getElementById("genOrUpload").appendChild(host);
    }
    const items = draftQuiz.questions.map((q, idx) => `
      <div class="q-editor-item">
        <div class="field" style="margin-bottom:8px">
          <label>Question ${idx + 1}</label>
          <textarea rows="2" oninput="App.updateQ(${idx}, 'text', this.value)">${escapeHtml(q.text)}</textarea>
        </div>
        ${[0, 1, 2, 3].map(oi => `
          <div class="opt-edit-row">
            <input type="radio" name="correct_${idx}" ${q.correctIndex === oi ? "checked" : ""} onchange="App.updateQ(${idx}, 'correctIndex', ${oi})" title="Mark as correct answer" />
            <input type="text" value="${escapeHtml(q.options[oi] || "")}" placeholder="Option ${String.fromCharCode(65 + oi)}" oninput="App.updateOpt(${idx}, ${oi}, this.value)" />
          </div>
        `).join("")}
        <div class="q-meta-row">
          <select onchange="App.updateQ(${idx}, 'type', this.value)">
            <option value="noncalc" ${q.type === "noncalc" ? "selected" : ""}>No calculation (50s)</option>
            <option value="calc" ${q.type === "calc" ? "selected" : ""}>Calculation (80s)</option>
          </select>
          <select onchange="App.updateQ(${idx}, 'dok', Number(this.value))">
            ${[1, 2, 3, 4].map(d => `<option value="${d}" ${q.dok === d ? "selected" : ""}>DOK ${d}</option>`).join("")}
          </select>
          <button class="btn btn-secondary" style="padding:6px 12px;font-size:12.5px" onclick="App.removeQ(${idx})">Remove</button>
        </div>
      </div>
    `).join("");

    host.innerHTML = `
      <hr class="divider" />
      <div class="exam-header">
        <h2 class="card-title" style="font-size:19px">Questions (${draftQuiz.questions.length})</h2>
        <button class="btn btn-secondary" onclick="App.addBlankQuestion()">+ Add question</button>
      </div>
      ${items}
      <hr class="divider" />
      <button class="btn btn-primary btn-block" onclick="App.publishQuiz(event)">Publish &amp; get share link</button>
      <button class="btn btn-secondary btn-block mt-8" onclick="App.saveDraft(event)">Save as draft</button>
    `;
  }

  function updateQ(idx, field, value) { draftQuiz.questions[idx][field] = value; }
  function updateOpt(idx, oi, value) { draftQuiz.questions[idx].options[oi] = value; }
  function removeQ(idx) { draftQuiz.questions.splice(idx, 1); renderQuestionEditor(); }

  function quizPayload(status) {
    return {
      teacherName: draftQuiz.teacherName,
      subject: draftQuiz.subject,
      topics: draftQuiz.topics,
      level: draftQuiz.level,
      typeOfWork: draftQuiz.typeOfWork,
      week: draftQuiz.week,
      questions: draftQuiz.questions,
      status,
      createdAtMs: Date.now()
    };
  }

  function validateBeforePublish() {
    if (draftQuiz.questions.length === 0) { alert("Add at least one question first."); return false; }
    for (const q of draftQuiz.questions) {
      if (!q.text.trim() || q.options.some(o => !o.trim())) {
        alert("Every question needs text and 4 filled-in options.");
        return false;
      }
    }
    return true;
  }

  function saveDraft(evt) {
    const id = draftQuiz.id || uid("QZ-");
    const btn = evt && evt.target;
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Saving…`; }
    db.collection("quizzes").doc(id).set(quizPayload("draft"))
      .then(() => {
        alert("Saved as draft.");
        window.location.hash = "teacher";
        renderTeacherArea();
      })
      .catch(err => {
        alert("Couldn't save the draft: " + err.message + "\n\nCheck your Firestore rules and firebase-config.js values.");
        if (btn) { btn.disabled = false; btn.textContent = "Save as draft"; }
      });
  }

  function publishQuiz(evt) {
    if (!validateBeforePublish()) return;
    const id = draftQuiz.id || uid("QZ-");
    const btn = evt && evt.target;
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Publishing…`; }
    db.collection("quizzes").doc(id).set(quizPayload("published"))
      .then(() => {
        draftQuiz.id = id;
        showShare(id);
      })
      .catch(err => {
        alert("Couldn't publish the quiz: " + err.message + "\n\nCheck your Firestore rules and firebase-config.js values.");
        if (btn) { btn.disabled = false; btn.textContent = "Publish & get share link"; }
      });
  }

  function resumeEdit(quizId) {
    const q = teacherQuizzesCache.find(x => x.id === quizId);
    if (!q) return;
    draftQuiz = { ...q };
    renderNewQuizForm();
    document.getElementById("f_subject").value = q.subject;
    document.getElementById("f_topics").value = q.topics;
    document.getElementById("f_level").value = q.level;
    document.getElementById("f_type").value = q.typeOfWork;
    document.getElementById("f_week").value = q.week;
    renderQuestionEditor();
  }

  function showShare(quizId) {
    const link = shareLink(quizId);
    const waText = encodeURIComponent(`QUIZHUB — your quiz is ready. Open this link to begin: ${link}`);
    shell(`
      <div class="card">
        <p class="eyebrow">Quiz published</p>
        <h1 class="card-title">Share this link with your class</h1>
        <div class="field">
          <input type="text" id="shareLinkInput" readonly value="${escapeHtml(link)}" />
        </div>
        <div class="btn-row">
          <button class="btn btn-whatsapp" onclick="window.open('https://wa.me/?text=${waText}','_blank')">Share on WhatsApp</button>
          <button class="btn btn-secondary" onclick="navigator.clipboard.writeText('${link}');this.textContent='Copied!'">Copy link</button>
        </div>
        <hr class="divider" />
        <button class="btn btn-secondary" onclick="window.location.hash='teacher';App.renderTeacherArea();">&larr; Back to dashboard</button>
      </div>
    `, { tagline: "Share link" });
  }

  /* ---------------- Teacher: results & export ---------------- */

  function renderResults(quizId) {
    shell(`
      <div class="card wide">
        <p class="eyebrow">Results</p>
        <h1 class="card-title">Submissions</h1>
        <div id="resultsWrap"><p class="small">Loading…</p></div>
        <div class="btn-row mt-24">
          <button class="btn btn-primary" id="exportBtn" onclick="App.exportResults('${quizId}')">Export to Excel</button>
          <button class="btn btn-secondary" onclick="window.location.hash='teacher';App.renderTeacherArea();">&larr; Back to dashboard</button>
        </div>
      </div>
    `, { tagline: "Results" });

    db.collection("quizzes").doc(quizId).collection("submissions").get().then(snap => {
      const rows = [];
      snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
      rows.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
      resultsCache = rows;
      const wrap = document.getElementById("resultsWrap");
      if (rows.length === 0) {
        wrap.innerHTML = `<p class="small">No submissions yet.</p>`;
        return;
      }
      wrap.innerHTML = `
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Name</th><th>Class</th><th>Score</th><th>%</th><th>Grade</th><th>Submitted</th></tr></thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${escapeHtml(r.surname)}, ${escapeHtml(r.firstName)} ${escapeHtml(r.middleName || "")}</td>
                  <td>${escapeHtml(r.className)}</td>
                  <td>${r.score}/${r.totalQuestions}</td>
                  <td>${(r.percentage || 0).toFixed(1)}%</td>
                  <td>${escapeHtml(grade(r.percentage || 0))}</td>
                  <td>${r.finishedAtMs ? new Date(r.finishedAtMs).toLocaleString() : "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    });
  }

  let resultsCache = [];

  function exportResults(quizId) {
    if (!resultsCache.length) { alert("No submissions to export yet."); return; }
    const rows = resultsCache.map(r => ({
      Surname: r.surname, "First Name": r.firstName, "Middle Name": r.middleName || "",
      Level: r.level, Class: r.className, Score: r.score, Total: r.totalQuestions,
      Percentage: (r.percentage || 0).toFixed(1), Grade: grade(r.percentage || 0),
      "Submitted At": r.finishedAtMs ? new Date(r.finishedAtMs).toLocaleString() : ""
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Results");
    XLSX.writeFile(wb, `quizhub_${quizId}_results.xlsx`);
  }

  /* ============================================================
     STUDENT AREA
     ============================================================ */

  let activeQuiz = null;
  let activeSubmissionId = null;
  let activeOrder = [];
  let activeAnswers = [];
  let currentPos = 0;
  let timerInterval = null;

  function renderStudentEntry(quizId) {
    shell(`<div class="card"><p class="small">Loading quiz…</p></div>`);
    db.collection("quizzes").doc(quizId).get().then(doc => {
      if (!doc.exists) return renderStudentError("This quiz link doesn't exist. Please check the link with your teacher.");
      const quiz = { id: doc.id, ...doc.data() };
      if (quiz.status === "closed") return renderStudentError("This quiz has closed and is no longer accepting answers.");
      if (quiz.status === "draft") return renderStudentError("This quiz hasn't been published yet. Please check with your teacher.");
      activeQuiz = quiz;
      renderStudentRegistration(quiz);
    }).catch(err => renderStudentError("Couldn't load this quiz: " + err.message));
  }

  function renderStudentError(msg) {
    shell(`
      <div class="card">
        <div class="alert alert-error">${escapeHtml(msg)}</div>
      </div>
    `);
  }

  function renderStudentRegistration(quiz) {
    shell(`
      <div class="card">
        <p class="eyebrow">${escapeHtml(quiz.subject)} · ${escapeHtml(quiz.typeOfWork)}</p>
        <h1 class="card-title">Candidate details</h1>
        <p class="subtext">Set by ${escapeHtml(quiz.teacherName)} · ${escapeHtml(quiz.level)} · Week ${escapeHtml(String(quiz.week))} · ${(quiz.questions || []).length} questions</p>

        <div id="regError"></div>

        <div class="row">
          <div class="field"><label>Surname</label><input type="text" id="r_surname" /></div>
          <div class="field"><label>First name</label><input type="text" id="r_first" /></div>
        </div>
        <div class="field"><label>Middle name (if any)</label><input type="text" id="r_middle" /></div>
        <div class="row">
          <div class="field"><label>Level</label>
            <select id="r_level">
              <option ${quiz.level === "SHS1" ? "selected" : ""}>SHS1</option>
              <option ${quiz.level === "SHS2" ? "selected" : ""}>SHS2</option>
              <option ${quiz.level === "SHS3" ? "selected" : ""}>SHS3</option>
            </select>
          </div>
          <div class="field"><label>Class</label><input type="text" id="r_class" placeholder="e.g. SHS2 Gold" /></div>
        </div>

        <div class="alert alert-info">Rules: once you select an answer it locks in immediately and you move to the next question — there's no going back, and each account (name + class) can only attempt this quiz once.</div>

        <button class="btn btn-primary btn-block" id="startBtn" onclick="App.beginAttempt('${quiz.id}')">Start quiz</button>
      </div>
    `, { tagline: "Candidate registration" });
  }

  async function beginAttempt(quizId) {
    const surname = document.getElementById("r_surname").value.trim();
    const first = document.getElementById("r_first").value.trim();
    const middle = document.getElementById("r_middle").value.trim();
    const level = document.getElementById("r_level").value;
    const className = document.getElementById("r_class").value.trim();
    const errEl = document.getElementById("regError");
    errEl.innerHTML = "";

    if (!surname || !first || !className) {
      errEl.innerHTML = `<div class="alert alert-error">Surname, first name and class are required.</div>`;
      return;
    }

    const subId = slugify(surname, first, middle, className);
    const startBtn = document.getElementById("startBtn");
    startBtn.disabled = true;
    startBtn.innerHTML = `<span class="spinner"></span> Checking…`;

    try {
      const subRef = db.collection("quizzes").doc(quizId).collection("submissions").doc(subId);
      const existing = await subRef.get();
      if (existing.exists) {
        errEl.innerHTML = `<div class="alert alert-error">A submission already exists for <strong>${escapeHtml(first)} ${escapeHtml(surname)}</strong> in <strong>${escapeHtml(className)}</strong>. This quiz can only be taken once per student.</div>`;
        startBtn.disabled = false;
        startBtn.textContent = "Start quiz";
        return;
      }

      const order = shuffledIndices(activeQuiz.questions.length);
      const submission = {
        surname, firstName: first, middleName: middle, level, className,
        order, answers: [], score: 0, totalQuestions: activeQuiz.questions.length,
        percentage: 0, startedAtMs: Date.now(), finishedAtMs: null, status: "in_progress"
      };
      await subRef.set(submission);

      activeSubmissionId = subId;
      activeOrder = order;
      activeAnswers = [];
      currentPos = 0;
      renderQuestion();
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error">Something went wrong: ${escapeHtml(err.message)}</div>`;
      startBtn.disabled = false;
      startBtn.textContent = "Start quiz";
    }
  }

  function renderQuestion() {
    clearInterval(timerInterval);
    const total = activeOrder.length;
    const qIndex = activeOrder[currentPos];
    const q = activeQuiz.questions[qIndex];
    const duration = TIMING[q.type] || TIMING.noncalc;
    const pct = Math.round((currentPos / total) * 100);

    shell(`
      <div class="card">
        <div class="progress-line"><div style="width:${pct}%"></div></div>
        <div class="exam-header">
          <div class="ticket">Q${String(currentPos + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
          <span class="dok-tag">DOK ${q.dok}</span>
          <div class="timer-wrap">
            <svg viewBox="0 0 64 64" width="64" height="64">
              <circle class="timer-track" cx="32" cy="32" r="27"></circle>
              <circle class="timer-progress" id="timerRing" cx="32" cy="32" r="27"
                stroke-dasharray="${2 * Math.PI * 27}" stroke-dashoffset="0"></circle>
            </svg>
            <div class="timer-num" id="timerNum">${duration}</div>
          </div>
        </div>

        <p class="question-text">${escapeHtml(q.text)}</p>
        <div class="options" id="optionsWrap">
          ${q.options.map((opt, oi) => `
            <button class="option" data-oi="${oi}" onclick="App.selectAnswer(${oi})">
              <span class="opt-letter">${String.fromCharCode(65 + oi)}</span>
              <span>${escapeHtml(opt)}</span>
            </button>
          `).join("")}
        </div>
      </div>
    `, { tagline: `${activeQuiz.subject} · ${activeQuiz.level}` });

    runTimer(duration, () => lockAnswer(-1));
  }

  function runTimer(duration, onExpire) {
    const circumference = 2 * Math.PI * 27;
    let remaining = duration;
    const ring = document.getElementById("timerRing");
    const num = document.getElementById("timerNum");

    function tick() {
      const frac = remaining / duration;
      ring.style.strokeDashoffset = String(circumference * (1 - frac));
      num.textContent = remaining;
      const critical = remaining <= 10;
      ring.classList.toggle("critical", critical);
      num.classList.toggle("critical", critical);
      if (remaining <= 0) {
        clearInterval(timerInterval);
        onExpire();
        return;
      }
      remaining -= 1;
    }
    tick();
    timerInterval = setInterval(tick, 1000);
  }

  function selectAnswer(oi) { lockAnswer(oi); }

  function lockAnswer(selectedOi) {
    clearInterval(timerInterval);
    const qIndex = activeOrder[currentPos];
    const q = activeQuiz.questions[qIndex];
    const correct = selectedOi === q.correctIndex;

    const buttons = document.querySelectorAll("#optionsWrap .option");
    buttons.forEach(btn => { btn.disabled = true; });
    if (selectedOi >= 0) {
      const chosenBtn = buttons[selectedOi];
      chosenBtn.classList.add("selected");
      const stamp = document.createElement("span");
      stamp.className = "stamp";
      stamp.textContent = "LOCKED";
      chosenBtn.appendChild(stamp);
    }

    activeAnswers.push({
      questionIndex: qIndex,
      questionText: q.text,
      options: q.options,
      selectedIndex: selectedOi,
      correctIndex: q.correctIndex,
      correct
    });

    setTimeout(() => {
      currentPos += 1;
      if (currentPos >= activeOrder.length) {
        finishAttempt();
      } else {
        renderQuestion();
      }
    }, 700);
  }

  async function finishAttempt() {
    const score = activeAnswers.filter(a => a.correct).length;
    const total = activeAnswers.length;
    const percentage = total ? (score / total) * 100 : 0;

    const subRef = db.collection("quizzes").doc(activeQuiz.id).collection("submissions").doc(activeSubmissionId);
    await subRef.update({
      answers: activeAnswers, score, percentage,
      finishedAtMs: Date.now(), status: "completed"
    });

    renderStudentResults(score, total, percentage);
  }

  function renderStudentResults(score, total, percentage) {
    const g = grade(percentage);
    const reviewHtml = activeAnswers.map((a, i) => `
      <div class="review-item">
        <div class="q-num">Question ${i + 1}</div>
        <div class="q-text">${escapeHtml(a.questionText)}</div>
        <div class="ans-line ${a.correct ? "right" : "wrong"}">Your answer: ${a.selectedIndex >= 0 ? escapeHtml(a.options[a.selectedIndex]) : "No answer (time expired)"}</div>
        ${!a.correct ? `<div class="ans-line right">Correct answer: ${escapeHtml(a.options[a.correctIndex])}</div>` : ""}
      </div>
    `).join("");

    shell(`
      <div class="card">
        <div class="score-hero">
          <div class="score-num">${score}/${total}</div>
          <div class="score-label">Final score</div>
          <div class="grade-pill">${g} · ${percentage.toFixed(1)}%</div>
        </div>
        <div class="alert alert-success">Your result has been saved automatically to ${escapeHtml(activeQuiz.teacherName)}'s dashboard — no need to send anything.</div>
        <button class="btn btn-secondary btn-block" onclick="App.downloadSummary()">Download my summary</button>
        <hr class="divider" />
        <h2 class="card-title" style="font-size:18px">Question review</h2>
        ${reviewHtml}
      </div>
    `, { tagline: "Results" });
  }

  function downloadSummary() {
    const win = window.open("", "_blank");
    const rows = activeAnswers.map((a, i) => `
      <p><b>Q${i + 1}.</b> ${escapeHtml(a.questionText)}<br/>
      Your answer: ${a.selectedIndex >= 0 ? escapeHtml(a.options[a.selectedIndex]) : "No answer"}
      ${!a.correct ? ` — Correct: ${escapeHtml(a.options[a.correctIndex])}` : " — Correct"}</p>
    `).join("");
    const score = activeAnswers.filter(a => a.correct).length;
    const total = activeAnswers.length;
    const pct = total ? (score / total) * 100 : 0;
    win.document.write(`
      <html><head><title>QUIZHUB summary</title>
      <style>body{font-family:sans-serif;padding:24px;max-width:700px;margin:auto} h1{margin-bottom:0} .meta{color:#555;font-size:14px}</style>
      </head><body>
      <h1>QUIZHUB — Result Summary</h1>
      <p class="meta">${escapeHtml(activeQuiz.subject)} · ${escapeHtml(activeQuiz.typeOfWork)} · Week ${escapeHtml(String(activeQuiz.week))} · Set by ${escapeHtml(activeQuiz.teacherName)}</p>
      <h2>${score}/${total} (${pct.toFixed(1)}%) — Grade ${grade(pct)}</h2>
      <hr/>${rows}
      <hr/><p>© AssifMan</p>
      <script>window.print()</script>
      </body></html>
    `);
    win.document.close();
  }

  /* ============================================================
     INIT
     ============================================================ */

  function init() {
    route();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("service-worker.js").catch(() => {});
    }
  }

  return {
    init, goTeacher, goHome, submitTeacherLogin, switchTeacher,
    renderNewQuizForm, startAIGeneration, runGeneration, showUploadForm,
    parseUploadedQuestions, addBlankQuestion, updateQ, updateOpt, removeQ,
    saveDraft, publishQuiz, resumeEdit, showShare, closeQuiz,
    renderResults, exportResults, renderTeacherArea,
    beginAttempt, selectAnswer, downloadSummary
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
