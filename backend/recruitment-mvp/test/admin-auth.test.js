const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  BAN_DURATIONS_MS,
  MAX_FAILED_ATTEMPTS,
  createAdminSessionStore,
  extractBearerToken,
  getEscalatingBanDurationMs,
  getFailedAttemptUpdate,
  getLoginDelayMs,
  getLoginState,
  verifyAdminPassword
} = require("../admin-auth");

describe("admin-auth", () => {
  it("valide le mot de passe admin", () => {
    const config = { adminPassword: "secret-admin", adminSecret: "test-secret" };
    assert.equal(verifyAdminPassword("secret-admin", config), true);
    assert.equal(verifyAdminPassword("wrong", config), false);
  });

  it("bloque apres 3 tentatives", () => {
    const first = getFailedAttemptUpdate(0, 0);
    const second = getFailedAttemptUpdate(first.failedAttempts, first.banCount);
    const third = getFailedAttemptUpdate(second.failedAttempts, second.banCount);

    assert.equal(first.remainingAttempts, MAX_FAILED_ATTEMPTS - 1);
    assert.equal(third.banned, true);
    assert.equal(third.remainingAttempts, 0);
    assert.ok(third.bannedUntil);
    assert.equal(third.banCount, 1);
  });

  it("escalade la duree de ban", () => {
    assert.equal(getEscalatingBanDurationMs(0), BAN_DURATIONS_MS[0]);
    assert.equal(getEscalatingBanDurationMs(1), BAN_DURATIONS_MS[1]);
    assert.equal(getEscalatingBanDurationMs(5), BAN_DURATIONS_MS[2]);

    const firstBan = getFailedAttemptUpdate(2, 0);
    const secondBan = getFailedAttemptUpdate(2, 1);
    assert.equal(firstBan.banDurationMs, BAN_DURATIONS_MS[0]);
    assert.equal(secondBan.banDurationMs, BAN_DURATIONS_MS[1]);
  });

  it("applique un delai progressif avant verification", () => {
    assert.equal(getLoginDelayMs(0), 0);
    assert.equal(getLoginDelayMs(1), 1000);
    assert.equal(getLoginDelayMs(2), 2000);
    assert.equal(getLoginDelayMs(4), 8000);
  });

  it("reinitialise les tentatives apres expiration du ban", () => {
    const state = getLoginState({
      failed_attempts: 3,
      ban_count: 2,
      banned_until: new Date(Date.now() - 1000).toISOString()
    });

    assert.equal(state.banned, false);
    assert.equal(state.failedAttempts, 0);
    assert.equal(state.remainingAttempts, MAX_FAILED_ATTEMPTS);
    assert.equal(state.banCount, 2);
  });

  it("detecte un ban actif", () => {
    const state = getLoginState({
      failed_attempts: 3,
      banned_until: new Date(Date.now() + 60_000).toISOString()
    });

    assert.equal(state.banned, true);
    assert.equal(state.remainingAttempts, 0);
  });

  it("gere les tokens bearer et sessions", () => {
    const store = createAdminSessionStore();
    const session = store.create();
    assert.ok(store.isValid(session.token));
    assert.equal(extractBearerToken(`Bearer ${session.token}`), session.token);
    store.revoke(session.token);
    assert.equal(store.isValid(session.token), false);
  });
});
