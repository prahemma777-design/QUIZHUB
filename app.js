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

  /* ---------------- Local "session" (username/password, no full Firebase Auth — documented tradeoff) ---------------- */

  const Session = {
    getUsername() { return localStorage.getItem("quizhub_teacher_username") || ""; },
    getEmail() { return localStorage.getItem("quizhub_teacher_email") || ""; },
    setTeacher(username, email) {
      localStorage.setItem("quizhub_teacher_username", username);
      localStorage.setItem("quizhub_teacher_email", email || "");
    },
    clearTeacher() {
      localStorage.removeItem("quizhub_teacher_username");
      localStorage.removeItem("quizhub_teacher_email");
    }
  };

  async function hashPassword(pw) {
    const enc = new TextEncoder().encode(pw);
    const hashBuffer = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  /* ---------------- Footer & shell ---------------- */

  function shell(innerHtml, { tagline = "" } = {}) {
    root.innerHTML = `
      <div class="topbar">
        <img src="logo-full.png" alt="QUIZHUB — Assess. Learn. Achieve." class="brand-logo" />
        <div class="tagline">${escapeHtml(tagline)}</div>
      </div>
      ${innerHtml}
      <div class="site-footer">
        <div class="footer-tagline">Assess. Learn. Achieve.</div>
        <div>© AssifMan</div>
      </div>
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
    const username = Session.getUsername();
    if (!username) return renderTeacherAuth();
    renderTeacherDashboard(username);
  }

  function renderTeacherAuth(activeTab = "login") {
    shell(`
      <div class="card">
        <p class="eyebrow">Teacher access</p>
        <h1 class="card-title">${activeTab === "login" ? "Log in" : "Create your account"}</h1>
        <p class="subtext">Your account keeps your quizzes and results separate from every other teacher using QUIZHUB.</p>

        <div class="tab-row">
          <button class="tab-btn ${activeTab === "login" ? "active" : ""}" onclick="App.renderTeacherAuth('login')">Log in</button>
          <button class="tab-btn ${activeTab === "signup" ? "active" : ""}" onclick="App.renderTeacherAuth('signup')">Sign up</button>
        </div>

        <div id="authError"></div>

        ${activeTab === "login" ? `
          <div class="field"><label>Username</label><input type="text" id="loginUsername" autocomplete="username" /></div>
          <div class="field"><label>Password</label><input type="password" id="loginPassword" autocomplete="current-password" /></div>
          <button class="btn btn-primary btn-block" id="loginBtn" onclick="App.submitTeacherLogin()">Log in</button>
        ` : `
          <div class="field"><label>Full name</label><input type="text" id="signupName" placeholder="e.g. Mr. Kwame Asante" /></div>
          <div class="field"><label>School name</label><input type="text" id="signupSchool" placeholder="e.g. Achimota Senior High School" /></div>
          <div class="field"><label>Email</label><input type="text" id="signupEmail" autocomplete="email" placeholder="you@school.edu.gh" /></div>
          <div class="field"><label>Username</label><input type="text" id="signupUsername" autocomplete="username" placeholder="e.g. kwame.asante" /></div>
          <div class="row">
            <div class="field"><label>Password</label><input type="password" id="signupPassword" autocomplete="new-password" /></div>
            <div class="field"><label>Confirm password</label><input type="password" id="signupPassword2" autocomplete="new-password" /></div>
          </div>
          <button class="btn btn-primary btn-block" id="signupBtn" onclick="App.submitTeacherSignup()">Create account</button>
        `}

        <p class="small mt-8"><a href="#" onclick="App.goHome();return false;">&larr; Back</a></p>
      </div>
    `);
  }

  function goHome() { window.location.hash = ""; window.history.replaceState({}, "", window.location.pathname); route(); }

  async function submitTeacherSignup() {
    const name = document.getElementById("signupName").value.trim();
    const school = document.getElementById("signupSchool").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const username = document.getElementById("signupUsername").value.trim();
    const pw = document.getElementById("signupPassword").value;
    const pw2 = document.getElementById("signupPassword2").value;
    const errEl = document.getElementById("authError");
    errEl.innerHTML = "";

    if (!name || !school || !email || !username || !pw) {
      errEl.innerHTML = `<div class="alert alert-error">Please fill in every field.</div>`;
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      errEl.innerHTML = `<div class="alert alert-error">That doesn't look like a valid email address.</div>`;
      return;
    }
    if (pw.length < 6) {
      errEl.innerHTML = `<div class="alert alert-error">Password must be at least 6 characters.</div>`;
      return;
    }
    if (pw !== pw2) {
      errEl.innerHTML = `<div class="alert alert-error">Passwords don't match.</div>`;
      return;
    }

    const usernameKey = slugify(username);
    const btn = document.getElementById("signupBtn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Creating account…`;

    try {
      const ref = db.collection("teachers").doc(usernameKey);
      const existing = await ref.get();
      if (existing.exists) {
        errEl.innerHTML = `<div class="alert alert-error">That username is already taken — please choose another.</div>`;
        btn.disabled = false; btn.textContent = "Create account";
        return;
      }
      const passwordHash = await hashPassword(pw);
      await ref.set({ name, school, email, username, passwordHash, createdAtMs: Date.now() });
      Session.setTeacher(usernameKey, email);
      renderTeacherArea();
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error">Couldn't create the account: ${escapeHtml(err.message)}. Check your Firestore rules allow writes to the "teachers" collection.</div>`;
      btn.disabled = false; btn.textContent = "Create account";
    }
  }

  async function submitTeacherLogin() {
    const username = document.getElementById("loginUsername").value.trim();
    const pw = document.getElementById("loginPassword").value;
    const errEl = document.getElementById("authError");
    errEl.innerHTML = "";

    if (!username || !pw) {
      errEl.innerHTML = `<div class="alert alert-error">Enter both your username and password.</div>`;
      return;
    }

    const usernameKey = slugify(username);
    const btn = document.getElementById("loginBtn");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Logging in…`;

    try {
      const ref = db.collection("teachers").doc(usernameKey);
      const doc = await ref.get();
      if (!doc.exists) {
        errEl.innerHTML = `<div class="alert alert-error">No account found with that username.</div>`;
        btn.disabled = false; btn.textContent = "Log in";
        return;
      }
      const data = doc.data();
      const hash = await hashPassword(pw);
      if (hash !== data.passwordHash) {
        errEl.innerHTML = `<div class="alert alert-error">Incorrect password.</div>`;
        btn.disabled = false; btn.textContent = "Log in";
        return;
      }
      Session.setTeacher(usernameKey, data.email);
      renderTeacherArea();
    } catch (err) {
      errEl.innerHTML = `<div class="alert alert-error">Couldn't log in: ${escapeHtml(err.message)}</div>`;
      btn.disabled = false; btn.textContent = "Log in";
    }
  }

  let teacherQuizzesCache = [];
  let teacherDisplayName = "";
  let teacherSchool = "";

  function renderTeacherDashboard(usernameKey) {
    shell(`
      <div class="card wide">
        <div class="exam-header">
          <div>
            <p class="eyebrow" id="teacherSchoolLine">Teacher dashboard</p>
            <h1 class="card-title">Loading…</h1>
          </div>
          <div class="btn-row">
            <button class="btn btn-secondary" onclick="App.renderGradebook()">Gradebook</button>
            <button class="btn btn-secondary" onclick="App.logoutTeacher()">Log out</button>
            <button class="btn btn-primary" onclick="App.renderNewQuizForm()">+ New quiz</button>
          </div>
        </div>
        <div id="quizListWrap"><p class="small">Loading your quizzes…</p></div>
      </div>
    `, { tagline: "Teacher dashboard" });

    db.collection("teachers").doc(usernameKey).get()
      .then(doc => {
        teacherDisplayName = doc.exists ? (doc.data().name || doc.data().username) : usernameKey;
        teacherSchool = doc.exists ? (doc.data().school || "") : "";
        const titleEl = document.querySelector(".card-title");
        if (titleEl) titleEl.textContent = teacherDisplayName;
        const schoolLine = document.getElementById("teacherSchoolLine");
        if (schoolLine && teacherSchool) schoolLine.textContent = teacherSchool;
      })
      .catch(() => {});

    db.collection("quizzes").where("teacherUsername", "==", usernameKey)
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

  function logoutTeacher() { Session.clearTeacher(); renderTeacherArea(); }

  function closeQuiz(quizId) {
    if (!confirm("Close this quiz? Students will no longer be able to open the link.")) return;
    db.collection("quizzes").doc(quizId).update({ status: "closed" }).then(() => renderTeacherDashboard(Session.getUsername()));
  }

  /* ---------------- New quiz / question builder ---------------- */

  let draftQuiz = null; // { teacherUsername, teacherName, subject, topics, level, typeOfWork, week, classes, questions: [] }

  function renderNewQuizForm() {
    draftQuiz = {
      teacherUsername: Session.getUsername(),
      teacherName: teacherDisplayName || Session.getUsername(),
      schoolName: teacherSchool || "",
      subject: "", topics: "", level: "SHS2", typeOfWork: "Class Test", week: "",
      classes: [], questions: []
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
        <div class="field">
          <label>Classes this test is for</label>
          <div class="row">
            <input type="text" id="f_classInput" placeholder="e.g. SHS2 Gold" style="flex:1" onkeydown="if(event.key==='Enter'){event.preventDefault();App.addClassChip();}" />
            <button type="button" class="btn btn-secondary" onclick="App.addClassChip()">Add class</button>
          </div>
          <p class="hint">Add each class separately — students will pick theirs from a list, so there's no risk of typos.</p>
          <div class="chip-row" id="classChipRow"></div>
        </div>

        <hr class="divider" />
        <div id="genOrUpload"></div>
      </div>
    `, { tagline: "New quiz" });
    renderClassChips();
    renderGenOrUploadChoice();
  }

  function renderClassChips() {
    const row = document.getElementById("classChipRow");
    if (!row) return;
    row.innerHTML = draftQuiz.classes.map((c, i) => `
      <span class="chip">${escapeHtml(c)} <button type="button" onclick="App.removeClassChip(${i})" title="Remove">&times;</button></span>
    `).join("");
  }

  function addClassChip() {
    const input = document.getElementById("f_classInput");
    const val = input.value.trim();
    if (!val) return;
    if (!draftQuiz.classes.some(c => c.toLowerCase() === val.toLowerCase())) {
      draftQuiz.classes.push(val);
      renderClassChips();
    }
    input.value = "";
    input.focus();
  }

  function removeClassChip(idx) {
    draftQuiz.classes.splice(idx, 1);
    renderClassChips();
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
      <p class="subtext">Type or paste your questions below, or upload a Word/PDF/text file — whichever's easier.</p>

      <div class="field">
        <label>Type or paste your questions here</label>
        <textarea id="f_pasteText" rows="10" placeholder="1. Question text goes here?
A) First option
B) Second option
C) Third option
D) Fourth option
Answer: B
Type: noncalc
DOK: 2

2. Next question..."></textarea>
        <p class="hint">Number each question, letter each option A–D, and mark the right one with "Answer: B" (or a "*" next to it). "Type:" and "DOK:" are optional.</p>
      </div>
      <button class="btn btn-primary" onclick="App.parsePastedText()">Load these questions</button>

      <hr class="divider" />

      <div class="dropzone" id="fileDropzone" onclick="document.getElementById('f_uploadDoc').click()">
        <div class="dz-title">Or upload a file instead</div>
        <p class="small">.docx, .pdf, or .txt — same numbered format as above</p>
        <input type="file" id="f_uploadDoc" accept=".docx,.pdf,.txt" onchange="App.handleDocUpload(this)" />
      </div>

      <div id="genStatus" class="mt-24"></div>

      <p class="small mt-24">
        <a href="#" onclick="App.togglePasteJson();return false;" id="toggleJsonLink">Prefer to paste raw JSON instead?</a> ·
        <a href="#" onclick="App.addBlankQuestion();return false;">Start with a blank question</a>
      </p>
      <div id="jsonPasteArea" class="hidden mt-24">
        <div class="field"><textarea id="f_uploadJson" rows="8" placeholder='[{"text":"...","options":["A","B","C","D"],"correctIndex":0,"type":"noncalc","dok":2}]'></textarea></div>
        <button class="btn btn-secondary" onclick="App.parseUploadedQuestions()">Load JSON</button>
      </div>
    `;
  }

  function parsePastedText() {
    const raw = document.getElementById("f_pasteText").value;
    const statusEl = document.getElementById("genStatus");
    if (!raw.trim()) {
      statusEl.innerHTML = `<div class="alert alert-error">Paste or type some questions first.</div>`;
      return;
    }
    try {
      const questions = DocUpload.parseTextContent(raw);
      draftQuiz.questions = questions;
      statusEl.innerHTML = `<div class="alert alert-success">Loaded ${questions.length} questions. Review below, then publish.</div>`;
      renderQuestionEditor();
    } catch (err) {
      statusEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
  }

  function togglePasteJson() {
    const area = document.getElementById("jsonPasteArea");
    area.classList.toggle("hidden");
  }

  async function handleDocUpload(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;
    const statusEl = document.getElementById("genStatus");
    statusEl.innerHTML = `<div class="btn-row" style="align-items:center"><span class="spinner dark"></span><span class="small">Reading ${escapeHtml(file.name)}…</span></div>`;
    try {
      const questions = await DocUpload.parseAnyFile(file);
      draftQuiz.questions = questions;
      statusEl.innerHTML = `<div class="alert alert-success">Loaded ${questions.length} questions from ${escapeHtml(file.name)}. Review below, then publish.</div>`;
      renderQuestionEditor();
    } catch (err) {
      statusEl.innerHTML = `<div class="alert alert-error">${escapeHtml(err.message)}</div>`;
    }
    inputEl.value = "";
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
      teacherUsername: draftQuiz.teacherUsername,
      teacherName: draftQuiz.teacherName,
      schoolName: draftQuiz.schoolName || "",
      subject: draftQuiz.subject,
      topics: draftQuiz.topics,
      level: draftQuiz.level,
      typeOfWork: draftQuiz.typeOfWork,
      week: draftQuiz.week,
      classes: draftQuiz.classes || [],
      questions: draftQuiz.questions,
      status,
      createdAtMs: Date.now()
    };
  }

  function validateBeforePublish() {
    if (!draftQuiz.classes || draftQuiz.classes.length === 0) {
      alert("Add at least one class this test is for, so students have something to pick from.");
      return false;
    }
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
    renderNewQuizForm();
    draftQuiz = { ...q, classes: [...(q.classes || [])], questions: [...(q.questions || [])] };
    document.getElementById("f_subject").value = q.subject;
    document.getElementById("f_topics").value = q.topics;
    document.getElementById("f_level").value = q.level;
    document.getElementById("f_type").value = q.typeOfWork;
    document.getElementById("f_week").value = q.week;
    renderClassChips();
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

  /* ---------------- Gradebook (all classes, all assessments) ---------------- */
  // Groups every submission across every one of this teacher's quizzes by
  // the CLASS the student picked, with one column per assessment
  // (subject · type · week). This is what keeps a Week 6 Quiz and a
  // Week 14 Quiz — or two different classes — from ever mixing scores.

  let gradebookData = null; // { classNames: [...], byClass: { className: { assessments: [...], students: { key: {name, marks: {assessmentKey: {score,total,pct}}} } } } }
  let gradebookActiveClass = null;

  function assessmentKey(quiz) {
    return `${quiz.subject} · ${quiz.typeOfWork} · Wk${quiz.week}`;
  }

  async function renderGradebook() {
    shell(`
      <div class="card wide">
        <div class="exam-header">
          <div>
            <p class="eyebrow">Gradebook</p>
            <h1 class="card-title">All classes, all assessments</h1>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" id="gbExportBtn" onclick="App.exportGradebook()">Export Excel (one sheet per class)</button>
            <button class="btn btn-secondary" onclick="window.location.hash='teacher';App.renderTeacherArea();">&larr; Back to dashboard</button>
          </div>
        </div>
        <div id="gradebookWrap"><p class="small">Loading every quiz and submission — this can take a moment…</p></div>
      </div>
    `, { tagline: "Gradebook" });

    try {
      const usernameKey = Session.getUsername();
      const quizSnap = await db.collection("quizzes").where("teacherUsername", "==", usernameKey).get();
      const quizzes = [];
      quizSnap.forEach(d => quizzes.push({ id: d.id, ...d.data() }));

      const byClass = {};
      for (const quiz of quizzes) {
        const subSnap = await db.collection("quizzes").doc(quiz.id).collection("submissions").get();
        const aKey = assessmentKey(quiz);
        subSnap.forEach(sd => {
          const sub = sd.data();
          const className = sub.className || "Unassigned class";
          if (!byClass[className]) byClass[className] = { assessments: new Set(), students: {} };
          byClass[className].assessments.add(aKey);
          const studentKey = slugify(sub.surname, sub.firstName, sub.middleName);
          if (!byClass[className].students[studentKey]) {
            byClass[className].students[studentKey] = {
              name: `${sub.surname}, ${sub.firstName}${sub.middleName ? " " + sub.middleName : ""}`,
              marks: {}
            };
          }
          byClass[className].students[studentKey].marks[aKey] = {
            score: sub.score, total: sub.totalQuestions, pct: sub.percentage || 0
          };
        });
      }

      const classNames = Object.keys(byClass).sort();
      gradebookData = { classNames, byClass };
      gradebookActiveClass = classNames[0] || null;
      renderGradebookView();
    } catch (err) {
      document.getElementById("gradebookWrap").innerHTML =
        `<div class="alert alert-error">Couldn't build the gradebook: ${escapeHtml(err.message)}</div>`;
    }
  }

  function switchGradebookClass(className) {
    gradebookActiveClass = className;
    renderGradebookView();
  }

  function renderGradebookView() {
    const wrap = document.getElementById("gradebookWrap");
    if (!gradebookData || gradebookData.classNames.length === 0) {
      wrap.innerHTML = `<p class="small">No submissions yet across any of your quizzes.</p>`;
      return;
    }

    const tabs = gradebookData.classNames.map(c => `
      <button class="${c === gradebookActiveClass ? "active" : ""}" onclick="App.switchGradebookClass('${escapeHtml(c).replace(/'/g, "\\'")}')">${escapeHtml(c)}</button>
    `).join("");

    const cls = gradebookData.byClass[gradebookActiveClass];
    const assessments = Array.from(cls.assessments).sort();
    const students = Object.values(cls.students).sort((a, b) => a.name.localeCompare(b.name));

    const headerRow = `<tr><th>Student</th>${assessments.map(a => `<th>${escapeHtml(a)}</th>`).join("")}</tr>`;
    const bodyRows = students.map(s => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        ${assessments.map(a => {
          const m = s.marks[a];
          return `<td>${m ? `${m.score}/${m.total} (${m.pct.toFixed(0)}%)` : "—"}</td>`;
        }).join("")}
      </tr>
    `).join("");

    wrap.innerHTML = `
      <div class="gradebook-tabs">${tabs}</div>
      <div class="table-wrap">
        <table class="gradebook">
          <thead>${headerRow}</thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>
    `;
  }

  function exportGradebook() {
    if (!gradebookData || gradebookData.classNames.length === 0) {
      alert("No submissions to export yet.");
      return;
    }
    const wb = XLSX.utils.book_new();
    gradebookData.classNames.forEach(className => {
      const cls = gradebookData.byClass[className];
      const assessments = Array.from(cls.assessments).sort();
      const students = Object.values(cls.students).sort((a, b) => a.name.localeCompare(b.name));

      const rows = students.map(s => {
        const row = { Student: s.name };
        assessments.forEach(a => {
          const m = s.marks[a];
          row[a] = m ? `${m.score}/${m.total} (${m.pct.toFixed(0)}%)` : "";
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      // Excel sheet names: max 31 chars, no \ / ? * [ ] :
      const safeName = className.replace(/[\\/?*\[\]:]/g, "").slice(0, 31) || "Class";
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    });
    XLSX.writeFile(wb, `quizhub_gradebook_${Session.getUsername()}.xlsx`);
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
        <p class="subtext">Set by ${escapeHtml(quiz.teacherName)}${quiz.schoolName ? " · " + escapeHtml(quiz.schoolName) : ""} · ${escapeHtml(quiz.level)} · Week ${escapeHtml(String(quiz.week))} · ${(quiz.questions || []).length} questions</p>

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
          <div class="field"><label>Class</label>
            ${(quiz.classes && quiz.classes.length > 0)
              ? `<select id="r_class">
                  <option value="" disabled selected>Choose your class…</option>
                  ${quiz.classes.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
                </select>`
              : `<input type="text" id="r_class" placeholder="e.g. SHS2 Gold" />`
            }
          </div>
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
      buttons[selectedOi].classList.add("selected");
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
      <p class="meta">${escapeHtml(activeQuiz.subject)} · ${escapeHtml(activeQuiz.typeOfWork)} · Week ${escapeHtml(String(activeQuiz.week))} · Set by ${escapeHtml(activeQuiz.teacherName)}${activeQuiz.schoolName ? " · " + escapeHtml(activeQuiz.schoolName) : ""}</p>
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
    init, goTeacher, goHome,
    renderTeacherAuth, submitTeacherSignup, submitTeacherLogin, logoutTeacher,
    renderNewQuizForm, addClassChip, removeClassChip,
    startAIGeneration, runGeneration, showUploadForm, parsePastedText,
    togglePasteJson, handleDocUpload, parseUploadedQuestions, addBlankQuestion, updateQ, updateOpt, removeQ,
    saveDraft, publishQuiz, resumeEdit, showShare, closeQuiz,
    renderResults, exportResults, renderTeacherArea,
    renderGradebook, switchGradebookClass, exportGradebook,
    beginAttempt, selectAnswer, downloadSummary
  };
})();

document.addEventListener("DOMContentLoaded", App.init);
