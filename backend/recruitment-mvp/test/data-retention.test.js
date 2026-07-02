const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { after, before, describe, it } = require("node:test");
const { openDatabase } = require("../db");
const { purgeExpiredData, eraseCandidateByEmail } = require("../data-retention");

let db;
let dbPath;

function run(dbConn, sql, params = []) {
  return new Promise((resolve, reject) => {
    dbConn.run(sql, params, function onRun(error) {
      if (error) reject(error);
      else resolve(this);
    });
  });
}

before(() => {
  dbPath = path.join(os.tmpdir(), `mira-retention-test-${Date.now()}.db`);
  db = openDatabase(dbPath);
});

after(async () => {
  await new Promise((resolve) => db.close(resolve));
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
});

describe("data-retention", () => {
  it("purge les sessions expirées et leurs candidats", async () => {
    const candidateId = "candidate-retention-1";
    const sessionId = "session-retention-1";
    const expiredAt = "2020-01-01T00:00:00.000Z";

    await run(
      db,
      `
        INSERT INTO candidates (
          candidate_id, first_name, last_name, email, specialty, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [candidateId, "Test", "Purge", "purge@epitech.eu", "IA", expiredAt]
    );

    await run(
      db,
      `
        INSERT INTO sessions (
          session_id, candidate_id, created_at, expires_at, consent_given,
          score, verdict, total_questions, positive_answers, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [sessionId, candidateId, expiredAt, expiredAt, 1, 5, "Mitigé", 8, 5, "{}"]
    );

    await run(
      db,
      `
        INSERT INTO answers (
          session_id, question_id, question_text, expected_side, selected_side,
          is_fit, response_time_ms, answer_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [sessionId, "q1", "Question", "left", "left", 1, 100, "{}", expiredAt]
    );

    const result = await purgeExpiredData(db, new Date("2026-01-01T00:00:00.000Z"));
    assert.equal(result.purgedSessions, 1);
    assert.equal(result.purgedCandidates, 1);
  });

  it("efface un candidat par email", async () => {
    const candidateId = "candidate-erase-1";
    const sessionId = "session-erase-1";
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 86400000).toISOString();

    await run(
      db,
      `
        INSERT INTO candidates (
          candidate_id, first_name, last_name, email, specialty, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [candidateId, "Erase", "Me", "erase@epitech.eu", "IOT", createdAt]
    );

    await run(
      db,
      `
        INSERT INTO sessions (
          session_id, candidate_id, created_at, expires_at, consent_given,
          score, verdict, total_questions, positive_answers, metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [sessionId, candidateId, createdAt, expiresAt, 1, 3, "Mitigé", 8, 3, "{}"]
    );

    const result = await eraseCandidateByEmail(db, "erase@epitech.eu");
    assert.equal(result.erased, true);
    assert.equal(result.deletedSessions, 1);
  });
});
