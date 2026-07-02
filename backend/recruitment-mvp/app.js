const express = require("express");
const helmet = require("helmet");
const path = require("path");
const crypto = require("crypto");
const { validateCandidatePayload } = require("./candidate-validation");
const { registerAdminRoutes } = require("./admin-routes");
const { createAdminSessionStore } = require("./admin-auth");
const { createCandidateToken, verifyCandidateToken } = require("./candidate-auth");
const { validateConsentPayload } = require("./consent-config");
const { loadQuestionsFromFile, processSessionSubmission } = require("./questions-scoring");

const DEFAULT_QUESTIONS_PATH = path.resolve(
  __dirname,
  "../../ux-ui/recruitment-mvp/questions.json"
);

function createApp({
  db,
  staticDir,
  adminConfig,
  adminSessionStore = createAdminSessionStore(),
  candidateConfig = {},
  questionsPath = DEFAULT_QUESTIONS_PATH
}) {
  const app = express();
  const candidateTokenSecret = candidateConfig.tokenSecret || "mira-recruitment-candidate-secret-dev";
  let questions;

  try {
    questions = loadQuestionsFromFile(questionsPath);
  } catch (error) {
    console.error("Impossible de charger questions.json:", error.message);
    questions = [];
  }

  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: false,
      contentSecurityPolicy: false
    })
  );
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_, res) => {
    res.json({ ok: true, service: "mira-recruitment-mvp" });
  });

  app.post("/api/candidates/register", (req, res) => {
    const validation = validateCandidatePayload(req.body || {});
    const consentValidation = validateConsentPayload(req.body?.consent);

    if (!validation.isValid) {
      return res.status(400).json({
        ok: false,
        error: "Données du formulaire invalides.",
        fieldErrors: validation.errors
      });
    }

    if (!consentValidation.isValid) {
      return res.status(400).json({
        ok: false,
        error: "Consentement RGPD invalide ou manquant.",
        fieldErrors: consentValidation.errors
      });
    }

    const { firstName, lastName, email, specialty } = validation.normalized;
    const { at: consentAt, version: consentVersion } = consentValidation.normalized;
    const candidateId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const candidateToken = createCandidateToken(candidateId, candidateTokenSecret);

    db.get(
      `SELECT candidate_id FROM candidates WHERE email = ?`,
      [email],
      (lookupErr, existing) => {
        if (lookupErr) {
          return res.status(500).json({
            ok: false,
            error: "Erreur base de données (recherche candidat)."
          });
        }

        if (existing) {
          return res.status(409).json({
            ok: false,
            error: "Cette adresse email a déjà été utilisée pour une participation."
          });
        }

        db.run(
          `
            INSERT INTO candidates (
              candidate_id, first_name, last_name, email, specialty,
              consent_at, consent_version, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          [candidateId, firstName, lastName, email, specialty, consentAt, consentVersion, createdAt],
          (insertErr) => {
            if (insertErr) {
              if (insertErr.message.includes("UNIQUE")) {
                return res.status(409).json({
                  ok: false,
                  error: "Cette adresse email a déjà été utilisée pour une participation."
                });
              }
              return res.status(500).json({
                ok: false,
                error: "Erreur base de données (enregistrement candidat)."
              });
            }

            res.json({
              ok: true,
              candidateId,
              candidateToken,
              profile: {
                firstName,
                lastName,
                email,
                specialty
              }
            });
          }
        );
      }
    );
  });

  app.post("/api/session", (req, res) => {
    if (!questions.length) {
      return res.status(500).json({
        ok: false,
        error: "Configuration des questions indisponible."
      });
    }

    const payload = req.body || {};
    const { sessionId, candidateId, candidateToken, answers, metadata, consent } = payload;

    if (!sessionId || !candidateId || !Array.isArray(answers)) {
      return res.status(400).json({
        ok: false,
        error: "Payload invalide (sessionId, candidateId, answers requis)."
      });
    }

    if (!candidateToken) {
      return res.status(401).json({
        ok: false,
        error: "Jeton candidat invalide ou expiré."
      });
    }

    if (!verifyCandidateToken(candidateToken, candidateId, candidateTokenSecret)) {
      return res.status(401).json({
        ok: false,
        error: "Jeton candidat invalide ou expiré."
      });
    }

    const consentValidation = validateConsentPayload(consent);
    if (!consentValidation.isValid) {
      return res.status(400).json({
        ok: false,
        error: "Consentement RGPD invalide ou manquant.",
        fieldErrors: consentValidation.errors
      });
    }

    const scoring = processSessionSubmission(questions, answers);
    if (!scoring.ok) {
      return res.status(400).json({
        ok: false,
        error: scoring.error
      });
    }

    const { answers: evaluatedAnswers, score, scoredTotal, verdict, totalQuestions } = scoring;
    const { at: consentAt, version: consentVersion } = consentValidation.normalized;

    const now = new Date();
    const expires = new Date(now);
    expires.setFullYear(expires.getFullYear() + 2);

    const createdAt = now.toISOString();
    const expiresAt = expires.toISOString();

    db.get(
      `SELECT candidate_id FROM candidates WHERE candidate_id = ?`,
      [candidateId],
      (candidateErr, candidate) => {
        if (candidateErr) {
          return res.status(500).json({
            ok: false,
            error: "Erreur base de données (candidat)."
          });
        }

        if (!candidate) {
          return res.status(400).json({
            ok: false,
            error: "Candidat introuvable. Merci de remplir le formulaire."
          });
        }

        db.get(
          `SELECT session_id FROM sessions WHERE candidate_id = ?`,
          [candidateId],
          (existingSessionErr, existingSession) => {
            if (existingSessionErr) {
              return res.status(500).json({
                ok: false,
                error: "Erreur base de données (session existante)."
              });
            }

            if (existingSession) {
              return res.status(409).json({
                ok: false,
                error: "Ce candidat a déjà terminé le questionnaire."
              });
            }

            db.serialize(() => {
              db.run("BEGIN TRANSACTION");

              db.run(
                `
                  INSERT INTO sessions (
                    session_id, candidate_id, created_at, expires_at,
                    consent_given, consent_at, consent_version,
                    score, verdict, total_questions, positive_answers, metadata_json
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                  sessionId,
                  candidateId,
                  createdAt,
                  expiresAt,
                  1,
                  consentAt,
                  consentVersion,
                  score,
                  verdict,
                  totalQuestions,
                  score,
                  JSON.stringify(metadata || {})
                ],
                (sessionErr) => {
                  if (sessionErr) {
                    db.run("ROLLBACK");
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

                  const insertAnswer = db.prepare(`
                    INSERT INTO answers (
                      session_id, question_id, question_text, expected_side, selected_side,
                      is_fit, response_time_ms, answer_json, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                  `);

                  let answerError = null;

                  for (const answer of evaluatedAnswers) {
                    insertAnswer.run(
                      sessionId,
                      String(answer.questionId || ""),
                      String(answer.questionText || ""),
                      String(answer.expectedSide || ""),
                      String(answer.selectedSide || "timeout"),
                      answer.isFit ? 1 : 0,
                      Number(answer.responseTimeMs) || 0,
                      JSON.stringify(answer),
                      createdAt,
                      (err) => {
                        if (err) answerError = err;
                      }
                    );
                  }

                  insertAnswer.finalize((finalizeErr) => {
                    if (answerError || finalizeErr) {
                      db.run("ROLLBACK");
                      return res.status(500).json({
                        ok: false,
                        error: "Erreur base de données (réponses)."
                      });
                    }

                    db.run("COMMIT", (commitErr) => {
                      if (commitErr) {
                        return res.status(500).json({
                          ok: false,
                          error: "Erreur base de données (validation session)."
                        });
                      }

                      res.json({
                        ok: true,
                        score,
                        scoredTotal,
                        verdict,
                        retention: "Données conservées 2 ans maximum."
                      });
                    });
                  });
                }
              );
            });
          }
        );
      }
    );
  });

  if (adminConfig?.adminPassword) {
    registerAdminRoutes(app, {
      db,
      adminConfig,
      sessionStore: adminSessionStore
    });
  }

  if (staticDir) {
    app.get("/admin", (_, res) => {
      res.sendFile(path.join(staticDir, "admin.html"));
    });
    app.use(express.static(staticDir));
    app.get("*", (_, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  return app;
}

module.exports = {
  createApp,
  DEFAULT_QUESTIONS_PATH
};
