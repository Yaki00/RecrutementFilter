const crypto = require("crypto");
const { SESSION_DURATION_MS } = require("./admin-auth");

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createDbAdminSessionStore(db) {
  function create(ip = "unknown") {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashSessionToken(token);
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

    return new Promise((resolve, reject) => {
      db.run(
        `
          INSERT INTO admin_sessions (token_hash, ip, created_at, expires_at, last_seen_at)
          VALUES (?, ?, ?, ?, ?)
        `,
        [tokenHash, ip, createdAt, expiresAt, createdAt],
        (err) => {
          if (err) reject(err);
          else resolve({ token, expiresAt });
        }
      );
    });
  }

  function isValid(token, now = Date.now()) {
    const tokenHash = hashSessionToken(token);
    const nowIso = new Date(now).toISOString();

    return new Promise((resolve, reject) => {
      db.get(
        `
          SELECT token_hash, expires_at
          FROM admin_sessions
          WHERE token_hash = ? AND expires_at > ?
        `,
        [tokenHash, nowIso],
        (err, row) => {
          if (err) {
            reject(err);
            return;
          }
          if (!row) {
            resolve(false);
            return;
          }

          db.run(
            `UPDATE admin_sessions SET last_seen_at = ? WHERE token_hash = ?`,
            [nowIso, tokenHash],
            (updateErr) => {
              if (updateErr) reject(updateErr);
              else resolve(true);
            }
          );
        }
      );
    });
  }

  function revoke(token) {
    const tokenHash = hashSessionToken(token);
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM admin_sessions WHERE token_hash = ?`, [tokenHash], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  function purgeExpired(now = Date.now()) {
    const nowIso = new Date(now).toISOString();
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM admin_sessions WHERE expires_at <= ?`, [nowIso], function onPurge(err) {
        if (err) reject(err);
        else resolve(this.changes || 0);
      });
    });
  }

  return {
    create,
    isValid,
    revoke,
    purgeExpired
  };
}

module.exports = {
  createDbAdminSessionStore,
  hashSessionToken
};
