const express = require("express");
const helmet = require("helmet");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 8080;

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "recruitment.db");
const staticDir = path.resolve(__dirname, "../../ux-ui/recruitment-mvp");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consent_given INTEGER NOT NULL,
      score INTEGER NOT NULL,
      verdict TEXT NOT NULL,
      total_questions INTEGER NOT NULL,
      positive_answers INTEGER NOT NULL,
      metadata_json TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      question_text TEXT NOT NULL,
      expected_side TEXT NOT NULL,
      selected_side TEXT NOT NULL,
      is_fit INTEGER NOT NULL,
      response_time_ms INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(session_id)
    )
  `);
});

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    // CSP is managed at reverse-proxy level (Nginx) to allow MediaPipe CDNs.
    contentSecurityPolicy: false
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(staticDir));

app.get("/api/health", (_, res) => {
  res.json({ ok: true, service: "mira-recruitment-mvp" });
});

app.post("/api/session", (req, res) => {
  const payload = req.body || {};
  const {
    sessionId,
    consentGiven,
    score,
    verdict,
    totalQuestions,
    positiveAnswers,
    answers,
    metadata
  } = payload;

  if (!sessionId || !Array.isArray(answers) || !verdict) {
    return res.status(400).json({
      ok: false,
      error: "Payload invalide (sessionId, verdict, answers requis)."
    });
  }

  const now = new Date();
  const expires = new Date(now);
  expires.setFullYear(expires.getFullYear() + 2);

  const createdAt = now.toISOString();
  const expiresAt = expires.toISOString();

  const insertSession = db.prepare(`
    INSERT INTO sessions (
      session_id, created_at, expires_at, consent_given, score, verdict,
      total_questions, positive_answers, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertAnswer = db.prepare(`
    INSERT INTO answers (
      session_id, question_id, question_text, expected_side, selected_side,
      is_fit, response_time_ms, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.serialize(() => {
    insertSession.run(
      sessionId,
      createdAt,
      expiresAt,
      consentGiven ? 1 : 0,
      Number(score) || 0,
      String(verdict),
      Number(totalQuestions) || 0,
      Number(positiveAnswers) || 0,
      JSON.stringify(metadata || {}),
      (sessionErr) => {
        if (sessionErr) {
          if (sessionErr.message.includes("UNIQUE")) {
            return res
              .status(409)
              .json({ ok: false, error: "Session déjà enregistrée." });
          }
          return res.status(500).json({
            ok: false,
            error: "Erreur base de données (session)."
          });
        }

        for (const answer of answers) {
          insertAnswer.run(
            sessionId,
            String(answer.questionId || ""),
            String(answer.questionText || ""),
            String(answer.expectedSide || ""),
            String(answer.selectedSide || ""),
            answer.isFit ? 1 : 0,
            Number(answer.responseTimeMs) || 0,
            createdAt
          );
        }

        res.json({
          ok: true,
          retention: "Données conservées 2 ans maximum."
        });
      }
    );
  });
});

app.get("*", (_, res) => {
  res.sendFile(path.join(staticDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`MIRA recruitment MVP running on port ${PORT}`);
  console.log(`Static dir: ${staticDir}`);
  console.log(`Database: ${dbPath}`);
});
