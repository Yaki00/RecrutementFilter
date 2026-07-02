const sqlite3 = require("sqlite3").verbose();

function initDatabase(db) {
  db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");

    db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT UNIQUE NOT NULL,
        candidate_id TEXT,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consent_given INTEGER NOT NULL,
        consent_at TEXT,
        consent_version TEXT,
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
        answer_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(session_id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS candidates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        candidate_id TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        specialty TEXT NOT NULL,
        consent_at TEXT,
        consent_version TEXT,
        created_at TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS admin_login_attempts (
        ip TEXT PRIMARY KEY,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        banned_until TEXT,
        updated_at TEXT NOT NULL
      )
    `);

    db.run(`ALTER TABLE sessions ADD COLUMN candidate_id TEXT`, () => {});
    db.run(`ALTER TABLE answers ADD COLUMN answer_json TEXT`, () => {});
    db.run(`ALTER TABLE sessions ADD COLUMN consent_at TEXT`, () => {});
    db.run(`ALTER TABLE sessions ADD COLUMN consent_version TEXT`, () => {});
    db.run(`ALTER TABLE candidates ADD COLUMN consent_at TEXT`, () => {});
    db.run(`ALTER TABLE candidates ADD COLUMN consent_version TEXT`, () => {});
    db.run(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_candidate_id ON sessions(candidate_id)`,
      () => {}
    );
  });
}

function openDatabase(dbPath) {
  const db = new sqlite3.Database(dbPath);
  initDatabase(db);
  return db;
}

module.exports = {
  initDatabase,
  openDatabase
};
