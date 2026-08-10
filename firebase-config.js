/* ============================================================
   QUIZHUB — Firebase Configuration
   ============================================================
   1. Go to https://console.firebase.google.com → Create a project
      (it's free — the "Spark" plan covers a classroom easily).
   2. In the project, click the "</>" (web) icon to register a web app.
   3. Copy the config object Firebase gives you and paste the values
      below, replacing the placeholders.
   4. In the left menu, open "Build → Firestore Database" → Create
      database → Start in production mode → pick any region.
   5. Go to "Build → Firestore Database → Rules" and paste the rules
      from SETUP-GUIDE.md, then click Publish.
   6. Deploy the whole quizhub/ folder to GitHub Pages (see the guide)
      and share the generated quiz links on WhatsApp.
   ============================================================ */

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase (compat SDK, loaded via <script> tags in index.html)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* Quick self-check: warns in the console (not to the user) if the
   placeholder config is still in place, so setup mistakes are easy
   to spot during development. */
if (firebaseConfig.apiKey === "YOUR_API_KEY") {
  console.warn(
    "[QUIZHUB] firebase-config.js still has placeholder values. " +
    "Follow the setup steps at the top of this file before going live."
  );
}
