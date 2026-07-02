const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { after, before, describe, it } = require("node:test");
const request = require("supertest");
const { createApp, DEFAULT_QUESTIONS_PATH } = require("./app");
const { openDatabase } = require("./db");
const { createAdminSessionStore } = require("./admin-auth");
const { loadQuestionsFromFile } = require("./questions-scoring");
const { CONSENT_VERSION } = require("./consent-config");

let db;
let app;
let adminApp;
let dbPath;
const adminSessionStore = createAdminSessionStore();
const candidateSecret = "test-candidate-secret";
const questions = loadQuestionsFromFile(DEFAULT_QUESTIONS_PATH);

function validConsent() {
  return {
    given: true,
    at: new Date().toISOString(),
    version: CONSENT_VERSION
  };
}

function buildAnswers({ allCorrect = true } = {}) {
  return questions.map((question) => ({
    questionId: question.id,
    selectedSide: allCorrect
      ? question.fitSide
      : question.fitSide === "left"
        ? "right"
        : "left",
    responseTimeMs: 900
  }));
}

async function registerCandidate(email, specialty = "IA") {
  const response = await request(app)
    .post("/api/candidates/register")
    .send({
      firstName: "Test",
      lastName: "User",
      email,
      specialty,
      consent: validConsent()
    });

  return response;
}

before(() => {
  dbPath = path.join(os.tmpdir(), `mira-recruitment-test-${Date.now()}.db`);
  db = openDatabase(dbPath);
  app = createApp({
    db,
    staticDir: null,
    candidateConfig: { tokenSecret: candidateSecret },
    questionsPath: DEFAULT_QUESTIONS_PATH
  });
  adminApp = createApp({
    db,
    staticDir: null,
    adminConfig: {
      adminPassword: "test-admin-password",
      adminSecret: "test-admin-secret"
    },
    candidateConfig: { tokenSecret: candidateSecret },
    questionsPath: DEFAULT_QUESTIONS_PATH,
    adminSessionStore
  });
});

after(async () => {
  await new Promise((resolve) => db.close(resolve));
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
});

describe("POST /api/candidates/register", () => {
  it("enregistre un candidat valide avec consentement et jeton", async () => {
    const response = await registerCandidate("new.user@epitech.eu");

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.ok(response.body.candidateId);
    assert.ok(response.body.candidateToken);
    assert.equal(response.body.profile.email, "new.user@epitech.eu");
  });

  it("refuse un doublon email", async () => {
    const payload = {
      firstName: "Alice",
      lastName: "Martin",
      email: "duplicate@epitech.eu",
      specialty: "IA",
      consent: validConsent()
    };

    const first = await request(app).post("/api/candidates/register").send(payload);
    const second = await request(app).post("/api/candidates/register").send(payload);

    assert.equal(first.status, 200);
    assert.equal(second.status, 409);
    assert.match(second.body.error, /déjà été utilisée/);
  });

  it("refuse l'inscription sans consentement", async () => {
    const response = await request(app)
      .post("/api/candidates/register")
      .send({
        firstName: "No",
        lastName: "Consent",
        email: "noconsent@epitech.eu",
        specialty: "IA"
      });

    assert.equal(response.status, 400);
    assert.match(response.body.error, /Consentement/);
  });

  it("retourne des erreurs de validation", async () => {
    const response = await request(app)
      .post("/api/candidates/register")
      .send({
        firstName: "A",
        lastName: "",
        email: "bad@gmail.com",
        specialty: "",
        consent: validConsent()
      });

    assert.equal(response.status, 400);
    assert.ok(response.body.fieldErrors);
  });
});

describe("POST /api/session", () => {
  it("enregistre une session avec score recalculé côté serveur", async () => {
    const register = await registerCandidate("bob.session@epitech.eu", "Cybersécurité");

    const response = await request(app)
      .post("/api/session")
      .send({
        sessionId: "session-test-1",
        candidateId: register.body.candidateId,
        candidateToken: register.body.candidateToken,
        consent: validConsent(),
        score: 999,
        verdict: "Encourageant",
        answers: buildAnswers({ allCorrect: true }),
        metadata: { language: "fr-FR" }
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
    assert.equal(response.body.verdict, "Encourageant");
    assert.ok(response.body.score > 0);
  });

  it("rejette un verdict client falsifié", async () => {
    const register = await registerCandidate("fake.verdict@epitech.eu");

    const response = await request(app)
      .post("/api/session")
      .send({
        sessionId: "session-fake-verdict",
        candidateId: register.body.candidateId,
        candidateToken: register.body.candidateToken,
        consent: validConsent(),
        score: 99,
        verdict: "Encourageant",
        answers: buildAnswers({ allCorrect: false }),
        metadata: {}
      });

    assert.equal(response.status, 200);
    assert.equal(response.body.verdict, "Non retenu");
    assert.ok(response.body.score < response.body.scoredTotal);
  });

  it("refuse une session sans jeton candidat", async () => {
    const register = await registerCandidate("notoken@epitech.eu");

    const response = await request(app)
      .post("/api/session")
      .send({
        sessionId: "session-no-token",
        candidateId: register.body.candidateId,
        consent: validConsent(),
        answers: buildAnswers(),
        metadata: {}
      });

    assert.equal(response.status, 401);
  });

  it("refuse une seconde session pour le même candidat", async () => {
    const register = await registerCandidate("duplicate.session@epitech.eu");

    const first = await request(app)
      .post("/api/session")
      .send({
        sessionId: "session-dup-1",
        candidateId: register.body.candidateId,
        candidateToken: register.body.candidateToken,
        consent: validConsent(),
        answers: buildAnswers(),
        metadata: {}
      });

    const second = await request(app)
      .post("/api/session")
      .send({
        sessionId: "session-dup-2",
        candidateId: register.body.candidateId,
        candidateToken: register.body.candidateToken,
        consent: validConsent(),
        answers: buildAnswers(),
        metadata: {}
      });

    assert.equal(first.status, 200);
    assert.equal(second.status, 409);
  });
});

describe("GET /api/health", () => {
  it("repond ok", async () => {
    const response = await request(app).get("/api/health");
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, true);
  });
});

describe("Admin API", () => {
  it("refuse l'acces participants sans token", async () => {
    const response = await request(adminApp).get("/api/admin/participants");
    assert.equal(response.status, 401);
  });

  it("bloque apres 3 mauvais mots de passe", async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(adminApp)
        .post("/api/admin/login")
        .set("X-Forwarded-For", "10.0.0.1")
        .send({ password: "wrong-password" });
      assert.equal(response.status, attempt < 2 ? 401 : 423);
    }

    const banned = await request(adminApp)
      .post("/api/admin/login")
      .set("X-Forwarded-For", "10.0.0.1")
      .send({ password: "wrong-password" });
    assert.equal(banned.status, 423);
  });

  it("retourne les participants apres connexion", async () => {
    const register = await registerCandidate("claire.admin@epitech.eu");

    await request(app)
      .post("/api/session")
      .send({
        sessionId: "session-admin-1",
        candidateId: register.body.candidateId,
        candidateToken: register.body.candidateToken,
        consent: validConsent(),
        answers: buildAnswers(),
        metadata: {}
      });

    const login = await request(adminApp)
      .post("/api/admin/login")
      .set("X-Forwarded-For", "10.0.0.99")
      .send({ password: "test-admin-password" });
    assert.equal(login.status, 200);
    assert.ok(login.body.token);

    const participants = await request(adminApp)
      .get("/api/admin/participants")
      .set("Authorization", `Bearer ${login.body.token}`);

    assert.equal(participants.status, 200);
    assert.equal(participants.body.ok, true);
    assert.ok(participants.body.participants.length >= 1);
    assert.equal(participants.body.participants[0].email, "claire.admin@epitech.eu");
    assert.equal(participants.body.participants[0].sessions[0].answers[0].selectedLabel, "Oui");
  });

  it("retourne les kpis apres connexion", async () => {
    const login = await request(adminApp)
      .post("/api/admin/login")
      .set("X-Forwarded-For", "10.0.0.100")
      .send({ password: "test-admin-password" });
    assert.equal(login.status, 200);

    const kpis = await request(adminApp)
      .get("/api/admin/kpis")
      .set("Authorization", `Bearer ${login.body.token}`);

    assert.equal(kpis.status, 200);
    assert.equal(kpis.body.ok, true);
    assert.ok(typeof kpis.body.kpis.registeredCount === "number");
    assert.ok(typeof kpis.body.kpis.completionRate === "number");
  });

  it("purge les données expirées", async () => {
    const login = await request(adminApp)
      .post("/api/admin/login")
      .set("X-Forwarded-For", "10.0.0.101")
      .send({ password: "test-admin-password" });
    assert.equal(login.status, 200);

    const purge = await request(adminApp)
      .post("/api/admin/purge")
      .set("Authorization", `Bearer ${login.body.token}`);

    assert.equal(purge.status, 200);
    assert.equal(purge.body.ok, true);
    assert.ok(typeof purge.body.purgedSessions === "number");
  });

  it("efface un candidat par email", async () => {
    const register = await registerCandidate("erase.admin@epitech.eu");

    const login = await request(adminApp)
      .post("/api/admin/login")
      .set("X-Forwarded-For", "10.0.0.102")
      .send({ password: "test-admin-password" });
    assert.equal(login.status, 200);

    const erase = await request(adminApp)
      .post("/api/admin/erase-candidate")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ email: "erase.admin@epitech.eu" });

    assert.equal(erase.status, 200);
    assert.equal(erase.body.erased, true);
    assert.equal(erase.body.email, "erase.admin@epitech.eu");
    assert.equal(erase.body.candidateId, register.body.candidateId);
  });
});
