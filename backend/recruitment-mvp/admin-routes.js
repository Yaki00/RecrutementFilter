const {
  extractBearerToken,
  getFailedAttemptUpdate,
  getLoginDelayMs,
  getLoginState,
  verifyAdminPassword
} = require("./admin-auth");
const { createRateLimiter, sleep } = require("./admin-rate-limit");
const { createDbAdminSessionStore } = require("./admin-sessions");
const { computeKpis } = require("./admin-kpis");
const { purgeExpiredData, eraseCandidateByEmail } = require("./data-retention");

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

async function isSessionValid(sessionStore, token) {
  const result = sessionStore.isValid(token);
  return result instanceof Promise ? result : Promise.resolve(result);
}

function registerAdminRoutes(app, { db, adminConfig, sessionStore = createDbAdminSessionStore(db) }) {
  const loginRateLimit = createRateLimiter({
    windowMs: 15 * 60 * 1000,
    maxRequests: 20,
    name: "admin-login"
  });
  const apiRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    maxRequests: 90,
    name: "admin-api"
  });
  const sensitiveRateLimit = createRateLimiter({
    windowMs: 60 * 60 * 1000,
    maxRequests: 5,
    name: "admin-sensitive"
  });

  async function requireAdminAuth(req, res, next) {
    const token = extractBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ ok: false, error: "Authentification admin requise." });
    }

    try {
      const valid = await isSessionValid(sessionStore, token);
      if (!valid) {
        return res.status(401).json({ ok: false, error: "Session admin expirée ou invalide." });
      }
      req.adminToken = token;
      next();
    } catch (error) {
      res.status(500).json({ ok: false, error: "Erreur validation session admin." });
    }
  }

  function adminApiRateLimit(req, res, next) {
    const ip = getClientIp(req);
    const token = extractBearerToken(req.headers.authorization) || "anonymous";
    return apiRateLimit.middleware(() => `${ip}:${token.slice(0, 12)}`)(req, res, next);
  }

  function getAttemptRecord(ip) {
    return new Promise((resolve, reject) => {
      db.get(
        `SELECT ip, failed_attempts, ban_count, banned_until FROM admin_login_attempts WHERE ip = ?`,
        [ip],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  }

  function saveAttemptRecord(ip, failedAttempts, bannedUntil, banCount = 0) {
    return new Promise((resolve, reject) => {
      db.run(
        `
          INSERT INTO admin_login_attempts (ip, failed_attempts, ban_count, banned_until, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(ip) DO UPDATE SET
            failed_attempts = excluded.failed_attempts,
            ban_count = excluded.ban_count,
            banned_until = excluded.banned_until,
            updated_at = excluded.updated_at
        `,
        [ip, failedAttempts, banCount, bannedUntil, new Date().toISOString()],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  function clearAttemptRecord(ip) {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM admin_login_attempts WHERE ip = ?`, [ip], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async function resetExpiredBan(ip, record) {
    if (!record?.banned_until) return record;
    if (Date.parse(record.banned_until) > Date.now()) return record;

    await saveAttemptRecord(ip, 0, null, record.ban_count || 0);
    return {
      ...record,
      failed_attempts: 0,
      banned_until: null
    };
  }

  app.post(
    "/api/admin/login",
    loginRateLimit.middleware((req) => getClientIp(req)),
    async (req, res) => {
      const ip = getClientIp(req);
      const password = String(req.body?.password || "");

      try {
        let record = await getAttemptRecord(ip);
        record = await resetExpiredBan(ip, record);
        const loginState = getLoginState(record);

        if (loginState.banned) {
          return res.status(423).json({
            ok: false,
            error: "Accès temporairement bloqué après plusieurs tentatives incorrectes.",
            bannedUntil: loginState.bannedUntil
          });
        }

        const delayMs = getLoginDelayMs(record?.failed_attempts || 0);
        if (delayMs > 0) {
          await sleep(delayMs);
        }

        if (!password) {
          return res.status(400).json({ ok: false, error: "Mot de passe requis." });
        }

        if (!verifyAdminPassword(password, adminConfig)) {
          const update = getFailedAttemptUpdate(
            record?.failed_attempts || 0,
            record?.ban_count || 0
          );
          await saveAttemptRecord(ip, update.failedAttempts, update.bannedUntil, update.banCount);

          if (update.banned) {
            return res.status(423).json({
              ok: false,
              error: "Accès bloqué après 3 tentatives incorrectes. Réessayez plus tard.",
              bannedUntil: update.bannedUntil,
              banCount: update.banCount
            });
          }

          return res.status(401).json({
            ok: false,
            error: "Mot de passe incorrect.",
            remainingAttempts: update.remainingAttempts
          });
        }

        await clearAttemptRecord(ip);
        const sessionResult = sessionStore.create(ip);
        const session = sessionResult instanceof Promise ? await sessionResult : sessionResult;

        res.json({
          ok: true,
          token: session.token,
          expiresAt: session.expiresAt
        });
      } catch (error) {
        res.status(500).json({ ok: false, error: "Erreur authentification admin." });
      }
    }
  );

  app.post("/api/admin/logout", requireAdminAuth, async (req, res) => {
    try {
      const revokeResult = sessionStore.revoke(req.adminToken);
      if (revokeResult instanceof Promise) {
        await revokeResult;
      }
      res.json({ ok: true });
    } catch (error) {
      res.status(500).json({ ok: false, error: "Erreur déconnexion admin." });
    }
  });

  function fetchParticipants(callback) {
    db.all(
      `
        SELECT
          c.candidate_id,
          c.first_name,
          c.last_name,
          c.email,
          c.specialty,
          c.created_at AS candidate_created_at,
          s.session_id,
          s.score,
          s.verdict,
          s.total_questions,
          s.positive_answers,
          s.created_at AS session_created_at,
          s.metadata_json
        FROM candidates c
        LEFT JOIN sessions s ON s.candidate_id = c.candidate_id
        ORDER BY c.created_at DESC, s.created_at DESC
      `,
      [],
      (candidateErr, rows) => {
        if (candidateErr) {
          callback(candidateErr);
          return;
        }

        const participantsMap = new Map();

        for (const row of rows) {
          if (!participantsMap.has(row.candidate_id)) {
            participantsMap.set(row.candidate_id, {
              candidateId: row.candidate_id,
              firstName: row.first_name,
              lastName: row.last_name,
              email: row.email,
              specialty: row.specialty,
              registeredAt: row.candidate_created_at,
              sessions: []
            });
          }

          if (row.session_id) {
            participantsMap.get(row.candidate_id).sessions.push({
              sessionId: row.session_id,
              score: row.score,
              verdict: row.verdict,
              totalQuestions: row.total_questions,
              positiveAnswers: row.positive_answers,
              completedAt: row.session_created_at,
              metadata: safeJsonParse(row.metadata_json)
            });
          }
        }

        const participants = Array.from(participantsMap.values());
        const sessionIds = participants
          .flatMap((participant) => participant.sessions.map((session) => session.sessionId))
          .filter(Boolean);

        if (sessionIds.length === 0) {
          callback(null, participants);
          return;
        }

        const placeholders = sessionIds.map(() => "?").join(", ");
        db.all(
          `
            SELECT
              session_id,
              question_id,
              question_text,
              expected_side,
              selected_side,
              is_fit,
              response_time_ms,
              answer_json,
              created_at
            FROM answers
            WHERE session_id IN (${placeholders})
            ORDER BY created_at ASC, id ASC
          `,
          sessionIds,
          (answersErr, answers) => {
            if (answersErr) {
              callback(answersErr);
              return;
            }

            const answersBySession = new Map();
            for (const answer of answers) {
              if (!answersBySession.has(answer.session_id)) {
                answersBySession.set(answer.session_id, []);
              }

              const parsed = safeJsonParse(answer.answer_json);
              answersBySession.get(answer.session_id).push({
                questionId: answer.question_id,
                questionText: answer.question_text,
                expectedSide: answer.expected_side || null,
                selectedSide: answer.selected_side || null,
                selectedLabel: parsed?.selectedLabel || null,
                isFit: Boolean(answer.is_fit),
                timedOut: Boolean(parsed?.timedOut),
                scored: parsed?.scored !== false,
                responseTimeMs: answer.response_time_ms,
                createdAt: answer.created_at
              });
            }

            for (const participant of participants) {
              for (const session of participant.sessions) {
                session.answers = answersBySession.get(session.sessionId) || [];
              }
            }

            callback(null, participants);
          }
        );
      }
    );
  }

  app.get("/api/admin/participants", requireAdminAuth, adminApiRateLimit, (_, res) => {
    fetchParticipants((error, participants) => {
      if (error) {
        return res.status(500).json({ ok: false, error: "Erreur lecture participants." });
      }
      res.json({ ok: true, participants });
    });
  });

  app.get("/api/admin/kpis", requireAdminAuth, adminApiRateLimit, (_, res) => {
    fetchParticipants((error, participants) => {
      if (error) {
        return res.status(500).json({ ok: false, error: "Erreur lecture KPIs." });
      }
      res.json({ ok: true, kpis: computeKpis(participants) });
    });
  });

  app.post(
    "/api/admin/purge",
    requireAdminAuth,
    adminApiRateLimit,
    sensitiveRateLimit.middleware((req) => extractBearerToken(req.headers.authorization) || getClientIp(req)),
    async (_, res) => {
      try {
        const result = await purgeExpiredData(db);
        res.json({ ok: true, ...result });
      } catch (error) {
        res.status(500).json({ ok: false, error: "Erreur lors de la purge des données." });
      }
    }
  );

  app.post(
    "/api/admin/erase-candidate",
    requireAdminAuth,
    adminApiRateLimit,
    sensitiveRateLimit.middleware((req) => extractBearerToken(req.headers.authorization) || getClientIp(req)),
    async (req, res) => {
      const email = String(req.body?.email || "").trim();
      if (!email) {
        return res.status(400).json({ ok: false, error: "Email requis." });
      }

      try {
        const result = await eraseCandidateByEmail(db, email);
        if (!result.erased) {
          return res.status(404).json({ ok: false, error: "Candidat introuvable." });
        }
        res.json({ ok: true, ...result });
      } catch (error) {
        res.status(500).json({ ok: false, error: "Erreur lors de l'effacement du candidat." });
      }
    }
  );

  if (sessionStore.purgeExpired) {
    sessionStore.purgeExpired().catch(() => {});
    const sessionCleanupTimer = setInterval(() => {
      sessionStore.purgeExpired().catch(() => {});
    }, 60 * 60 * 1000);
    if (typeof sessionCleanupTimer.unref === "function") {
      sessionCleanupTimer.unref();
    }
  }

  return {
    sessionStore,
    loginRateLimit,
    apiRateLimit,
    sensitiveRateLimit,
    purgeExpiredSessions: () => sessionStore.purgeExpired?.()
  };
}

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

module.exports = {
  getClientIp,
  registerAdminRoutes
};
