# QUIZHUB — Setup Guide

QUIZHUB is a static Progressive Web App (no server to run) that uses:
- **Firebase Firestore** to store quizzes and student submissions in real time
- **Claude (Anthropic API)** to auto-generate questions
- **SheetJS** to export results to Excel
- Plain HTML/CSS/JS — no build step, no npm install

---

## 1. Important — how "Generate with AI" actually works

Right now, inside this Claude chat, the **Generate questions with AI** button works immediately — no setup, no API key. That's because Claude's own platform is quietly handling the connection to the API while you're working inside an artifact here.

**That connection does not travel with the files.** Once you download this app and deploy it to GitHub Pages (or anywhere outside Claude), `ai-generate.js`'s call to `api.anthropic.com` will fail, because there's no API key attached and no proxy in front of it. You have three options for real classroom use:

| Option | Setup effort | Security | Recommended for |
|---|---|---|---|
| **A. Prepare question banks in Claude, upload for live use** | None | Safest — no key ever touches the deployed site | Most teachers, most of the time |
| **B. Add your own Anthropic API key directly in the browser** | Low | ⚠️ Your key is visible to anyone via browser dev tools/network tab — anyone with the class link could copy it and rack up charges on your account | Only for a private/trusted testing link, never a public class link |
| **C. Route generation through a small serverless proxy you control** (e.g. a Firebase Cloud Function or Cloudflare Worker that holds the key server-side) | Medium (one-time) | Safe — key never reaches the browser | Teachers who want live AI generation for every quiz, long-term |

**Recommended workflow (Option A):** while you have Claude open, use "Generate questions with AI" to build out each week's question bank, review/edit the questions, then either publish straight from here, or copy the generated JSON and use **"Upload my own questions"** on the deployed site later. This needs nothing extra and keeps everything secure.

If you want to set up Option C, ask Claude (in a new chat, since this changes the app's code) to add a Cloud Function that wraps the Anthropic API call — that keeps your key private while still giving live generation on the deployed site.

---

## 2. Firebase setup (free Spark plan is enough for a class)

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project** → give it any name (e.g. "quizhub-economics").
2. Once created, click the **`</>`** (web) icon to register a web app. Give it a nickname — you don't need Firebase Hosting.
3. Firebase will show you a `firebaseConfig` object. Copy it into `firebase-config.js`, replacing the placeholder values.
4. In the left sidebar: **Build → Firestore Database → Create database**. Choose **Start in production mode**, pick a region close to you, click **Enable**.
5. Still in Firestore, open the **Rules** tab, replace the contents with the rules below, and click **Publish**.

### Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    match /teachers/{username} {
      // Needed so the login screen can look up a username and compare
      // password hashes client-side (see the security note below).
      allow read: if true;
      allow create: if !exists(/databases/$(database)/documents/teachers/$(username));
      allow update: if false;
      allow delete: if false;
    }

    match /students/{username} {
      allow read: if true;
      allow create: if !exists(/databases/$(database)/documents/students/$(username));
      allow update: if false;
      allow delete: if false;

      match /history/{quizId} {
        allow read: if true;
        allow create, update: if true; // written once per quiz after the student finishes
        allow delete: if false;
      }
    }

    match /quizzes/{quizId} {
      allow read: if true;
      allow create, update: if true;
      // Teachers are identified by the account created at signup — there
      // is no Firebase Authentication behind it, so writes still can't be
      // cryptographically restricted to "the right" teacher (see below).

      match /submissions/{submissionId} {
        allow read: if true;
        // A submission can only be CREATED if a document with this
        // exact ID doesn't already exist yet — this is what enforces
        // "one attempt per student" at the database level, not just
        // in the app's UI.
        allow create: if !exists(/databases/$(database)/documents/quizzes/$(quizId)/submissions/$(submissionId));
        // Only allow the one-time "finish" update (adding answers/score),
        // never a second full rewrite of someone else's submission.
        allow update: if resource.data.status == "in_progress";
        allow delete: if false;
      }
    }
  }
}
```

These rules stop the most common issues (overwriting another student's attempt, retaking a finished quiz) at the database level. They do **not** add teacher login — see the limitations section below.

---

## 3. Deploying with GitHub Pages

1. Create a new GitHub repository (e.g. `quizhub`) and upload every file in this folder — everything sits flat at the repo root, no subfolders needed.
2. Go to the repo's **Settings → Pages**.
3. Under "Build and deployment", choose **Deploy from a branch**, branch `main`, folder `/ (root)`. Save.
4. GitHub will give you a URL like `https://yourusername.github.io/quizhub/`. That's your app's home page.
5. Teachers open that URL → **Open teacher dashboard** to create quizzes. Student links look like `https://yourusername.github.io/quizhub/?quiz=QZ-abc123` and can be shared straight to WhatsApp with the in-app **Share on WhatsApp** button.
6. On a phone, opening the link and choosing "Add to Home Screen" (or the install prompt) installs it like a native app, thanks to `manifest.json` and `service-worker.js`.

---

## 4. Security model & limitations (please read)

Being upfront about the trade-offs of a backend-free app:

- **No real login, for teachers or students.** Signing up (either role) creates a document in Firestore with a username and a SHA-256 **hash** of the password (never the password itself). This stops the most casual snooping, but it is **not** the same as proper authentication — there's no session token, no email verification, and (because `allow read: if true` is needed for the login screen to check a password) anyone technical enough to open Firestore directly could read the stored hashes and attempt to crack a weak password offline. Encourage students not to reuse an important password here. If you need real accounts, ask Claude to add Firebase Authentication in a follow-up — that removes this limitation entirely.
- **The answer key does reach the browser.** Unlike a fully server-graded system, each question's `correctIndex` is part of the quiz document a student's browser downloads to run the quiz (this is what makes instant auto-grading and offline-friendly timing possible without a backend). A technically determined student could open browser dev tools and read the Firestore response to see correct answers early. The app never displays the answer key during the quiz, and the Firestore rules above stop tampering with scores after submission — but this is a real limitation of an app with no server, not just this one.
- **No-retry is enforced by document ID, not just the UI.** A submission's Firestore document ID is generated from the student's name + class, so even a student editing the page's JavaScript can't create a second submission with the same identity — Firestore itself will refuse it (see the `allow create` rule above).
- **Duplicate names across classes are fine.** Because the ID includes the class, "Mensah, Ama" in SHS2 Gold and "Mensah, Ama" in SHS2 Blue are treated as different people, as expected.

If this app will be used for high-stakes exams (not just class quizzes), consider adding Firebase Authentication for teachers and moving grading to a Cloud Function so the answer key never reaches the student's browser.

---

## 5. File overview

| File | Purpose |
|---|---|
| `index.html` | App shell, loads fonts, Firebase, SheetJS, mammoth/pdf.js, and the app scripts |
| `style.css` | The Ghana-palette exam-booklet design system (colors, type, components) |
| `app.js` | Routing, teacher accounts, quiz builder, quiz runner, grading, gradebook |
| `ai-generate.js` | Builds the prompt and parses Claude's response into question objects |
| `doc-upload.js` | Parses questions from an uploaded Excel/CSV, Word, PDF, or text file |
| `firebase-config.js` | Your Firebase project credentials (edit this first) |
| `manifest.json` / `service-worker.js` | Makes the app installable and gives it an offline app shell |
| `icon-192.png` / `icon-512.png` / `logo-full.png` | App icons and the header/footer logo |
| `ghana-pattern.svg` | Tiled Adinkra/castle/museum motif on the background |

---

## 6. Quick local test (before deploying)

You can't just double-click `index.html` (Firestore needs a proper origin). Instead, from this folder run any static server, e.g.:

```
npx serve .
```

then open the printed `http://localhost:...` address. AI generation will only work here if you've set up Option B or C from section 1 — otherwise use "Upload my own questions" with JSON you generated earlier in Claude.

---

© AssifMan
