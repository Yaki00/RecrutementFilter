function purgeExpiredData(db, now = new Date()) {
  const nowIso = now.toISOString();

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");

      db.all(
        `SELECT session_id, candidate_id FROM sessions WHERE expires_at <= ?`,
        [nowIso],
        (sessionErr, expiredSessions) => {
          if (sessionErr) {
            db.run("ROLLBACK");
            reject(sessionErr);
            return;
          }

          const sessionIds = (expiredSessions || []).map((row) => row.session_id);
          const candidateIds = (expiredSessions || [])
            .map((row) => row.candidate_id)
            .filter(Boolean);

          const deleteAnswers = (next) => {
            if (!sessionIds.length) return next();
            const placeholders = sessionIds.map(() => "?").join(", ");
            db.run(
              `DELETE FROM answers WHERE session_id IN (${placeholders})`,
              sessionIds,
              (answersErr) => {
                if (answersErr) reject(answersErr);
                else next();
              }
            );
          };

          const deleteSessions = (next) => {
            db.run(`DELETE FROM sessions WHERE expires_at <= ?`, [nowIso], (sessionsErr) => {
              if (sessionsErr) reject(sessionsErr);
              else next();
            });
          };

          const deleteCandidates = (next) => {
            if (!candidateIds.length) return next();
            const placeholders = candidateIds.map(() => "?").join(", ");
            db.run(
              `DELETE FROM candidates WHERE candidate_id IN (${placeholders})`,
              candidateIds,
              (candidatesErr) => {
                if (candidatesErr) reject(candidatesErr);
                else next();
              }
            );
          };

          deleteAnswers(() => {
            deleteSessions(() => {
              deleteCandidates(() => {
                db.run("COMMIT", (commitErr) => {
                  if (commitErr) reject(commitErr);
                  else {
                    resolve({
                      purgedSessions: sessionIds.length,
                      purgedCandidates: candidateIds.length,
                      purgedAt: nowIso
                    });
                  }
                });
              });
            });
          });
        }
      );
    });
  });
}

function eraseCandidateByEmail(db, email) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  return new Promise((resolve, reject) => {
    db.get(
      `SELECT candidate_id FROM candidates WHERE email = ?`,
      [normalizedEmail],
      (lookupErr, candidate) => {
        if (lookupErr) {
          reject(lookupErr);
          return;
        }
        if (!candidate) {
          resolve({ erased: false, reason: "not_found" });
          return;
        }

        db.serialize(() => {
          db.run("BEGIN TRANSACTION");
          db.all(
            `SELECT session_id FROM sessions WHERE candidate_id = ?`,
            [candidate.candidate_id],
            (sessionsErr, sessions) => {
              if (sessionsErr) {
                db.run("ROLLBACK");
                reject(sessionsErr);
                return;
              }

              const sessionIds = (sessions || []).map((row) => row.session_id);

              const deleteAnswers = (next) => {
                if (!sessionIds.length) return next();
                const placeholders = sessionIds.map(() => "?").join(", ");
                db.run(
                  `DELETE FROM answers WHERE session_id IN (${placeholders})`,
                  sessionIds,
                  (answersErr) => {
                    if (answersErr) reject(answersErr);
                    else next();
                  }
                );
              };

              deleteAnswers(() => {
                db.run(
                  `DELETE FROM sessions WHERE candidate_id = ?`,
                  [candidate.candidate_id],
                  (deleteSessionsErr) => {
                    if (deleteSessionsErr) {
                      db.run("ROLLBACK");
                      reject(deleteSessionsErr);
                      return;
                    }

                    db.run(
                      `DELETE FROM candidates WHERE candidate_id = ?`,
                      [candidate.candidate_id],
                      (deleteCandidateErr) => {
                        if (deleteCandidateErr) {
                          db.run("ROLLBACK");
                          reject(deleteCandidateErr);
                          return;
                        }

                        db.run("COMMIT", (commitErr) => {
                          if (commitErr) reject(commitErr);
                          else {
                            resolve({
                              erased: true,
                              email: normalizedEmail,
                              candidateId: candidate.candidate_id,
                              deletedSessions: sessionIds.length
                            });
                          }
                        });
                      }
                    );
                  }
                );
              });
            }
          );
        });
      }
    );
  });
}

module.exports = {
  purgeExpiredData,
  eraseCandidateByEmail
};
