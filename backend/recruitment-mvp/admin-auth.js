const crypto = require("crypto");

const MAX_FAILED_ATTEMPTS = 3;
const BAN_DURATION_MS = 30 * 60 * 1000;
const BAN_DURATIONS_MS = [
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000
];
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const MAX_LOGIN_DELAY_MS = 8000;

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

function getEscalatingBanDurationMs(banCount = 0) {
  const index = Math.min(Math.max(banCount, 0), BAN_DURATIONS_MS.length - 1);
  return BAN_DURATIONS_MS[index];
}

function getLoginDelayMs(failedAttempts = 0) {
  if (failedAttempts <= 0) return 0;
  return Math.min(MAX_LOGIN_DELAY_MS, 1000 * 2 ** (failedAttempts - 1));
}

function getLoginState(record, now = Date.now()) {
  if (!record) {
    return {
      banned: false,
      failedAttempts: 0,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
      bannedUntil: null,
      banCount: 0
    };
  }

  const banCount = record.ban_count || 0;
  const bannedUntilMs = record.banned_until ? Date.parse(record.banned_until) : 0;

  if (bannedUntilMs > 0 && bannedUntilMs <= now) {
    return {
      banned: false,
      failedAttempts: 0,
      remainingAttempts: MAX_FAILED_ATTEMPTS,
      bannedUntil: null,
      banCount
    };
  }

  const banned = bannedUntilMs > now;
  const failedAttempts = banned
    ? record.failed_attempts || MAX_FAILED_ATTEMPTS
    : record.failed_attempts || 0;

  return {
    banned,
    failedAttempts,
    remainingAttempts: banned ? 0 : Math.max(0, MAX_FAILED_ATTEMPTS - failedAttempts),
    bannedUntil: banned ? new Date(bannedUntilMs).toISOString() : null,
    banCount
  };
}

function getFailedAttemptUpdate(currentFailedAttempts, banCount = 0, now = Date.now()) {
  const nextFailed = (currentFailedAttempts || 0) + 1;
  const banned = nextFailed >= MAX_FAILED_ATTEMPTS;
  const nextBanCount = banned ? banCount + 1 : banCount;
  const banDurationMs = banned ? getEscalatingBanDurationMs(nextBanCount - 1) : 0;

  return {
    failedAttempts: nextFailed,
    banned,
    banCount: nextBanCount,
    bannedUntil: banned ? new Date(now + banDurationMs).toISOString() : null,
    remainingAttempts: banned ? 0 : Math.max(0, MAX_FAILED_ATTEMPTS - nextFailed),
    banDurationMs
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
  BAN_DURATIONS_MS,
  MAX_FAILED_ATTEMPTS,
  MAX_LOGIN_DELAY_MS,
  SESSION_DURATION_MS,
  createAdminSessionStore,
  extractBearerToken,
  getEscalatingBanDurationMs,
  getFailedAttemptUpdate,
  getLoginDelayMs,
  getLoginState,
  hashAdminPassword,
  verifyAdminPassword
};
