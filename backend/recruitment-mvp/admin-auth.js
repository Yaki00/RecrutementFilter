const crypto = require("crypto");

const MAX_FAILED_ATTEMPTS = 3;
const BAN_DURATION_MS = 30 * 60 * 1000;
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function hashAdminPassword(password, secret) {
  return crypto.createHmac("sha256", secret).update(String(password)).digest("hex");
}

function safeEqualHex(a, b) {
  try {
    const left = Buffer.from(String(a), "hex");
    const right = Buffer.from(String(b), "hex");
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

function verifyAdminPassword(password, config) {
  const expectedHash = hashAdminPassword(config.adminPassword, config.adminSecret);
  const providedHash = hashAdminPassword(password, config.adminSecret);
  return safeEqualHex(expectedHash, providedHash);
}

function getLoginState(record, now = Date.now()) {
  if (!record) {
    return {
      banned: false,
      failedAttempts: 0,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
      bannedUntil: null
    };
  }

  const bannedUntil = record.banned_until ? Date.parse(record.banned_until) : 0;
  const banned = bannedUntil > now;

  return {
    banned,
    failedAttempts: record.failed_attempts || 0,
    remainingAttempts: banned
      ? 0
      : Math.max(0, MAX_FAILED_ATTEMPTS - (record.failed_attempts || 0)),
    bannedUntil: banned ? new Date(bannedUntil).toISOString() : null
  };
}

function getFailedAttemptUpdate(currentFailedAttempts, now = Date.now()) {
  const nextFailed = (currentFailedAttempts || 0) + 1;
  const banned = nextFailed >= MAX_FAILED_ATTEMPTS;

  return {
    failedAttempts: nextFailed,
    banned,
    bannedUntil: banned ? new Date(now + BAN_DURATION_MS).toISOString() : null,
    remainingAttempts: banned ? 0 : Math.max(0, MAX_FAILED_ATTEMPTS - nextFailed)
  };
}

function createAdminSessionStore() {
  const sessions = new Map();

  return {
    create() {
      const token = crypto.randomBytes(32).toString("hex");
      const createdAt = Date.now();
      const expiresAt = createdAt + SESSION_DURATION_MS;
      sessions.set(token, { createdAt, expiresAt });
      return { token, expiresAt: new Date(expiresAt).toISOString() };
    },
    isValid(token, now = Date.now()) {
      const session = sessions.get(token);
      if (!session) return false;
      if (session.expiresAt <= now) {
        sessions.delete(token);
        return false;
      }
      return true;
    },
    revoke(token) {
      sessions.delete(token);
    }
  };
}

function extractBearerToken(authorizationHeader = "") {
  const [scheme, token] = String(authorizationHeader).split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
}

module.exports = {
  BAN_DURATION_MS,
  MAX_FAILED_ATTEMPTS,
  SESSION_DURATION_MS,
  createAdminSessionStore,
  extractBearerToken,
  getFailedAttemptUpdate,
  getLoginState,
  hashAdminPassword,
  verifyAdminPassword
};
