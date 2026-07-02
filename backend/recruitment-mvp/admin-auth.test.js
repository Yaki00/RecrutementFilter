const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  MAX_FAILED_ATTEMPTS,
  createAdminSessionStore,
  extractBearerToken,
  getFailedAttemptUpdate,
  getLoginState,
  verifyAdminPassword
} = require("./admin-auth");

describe("admin-auth", () => {
  it("valide le mot de passe admin", () => {
    const config = { adminPassword: "secret-admin", adminSecret: "test-secret" };
    assert.equal(verifyAdminPassword("secret-admin", config), true);
    assert.equal(verifyAdminPassword("wrong", config), false);
  });

  it("bloque apres 3 tentatives", () => {
    const first = getFailedAttemptUpdate(0);
    const second = getFailedAttemptUpdate(first.failedAttempts);
    const third = getFailedAttemptUpdate(second.failedAttempts);

    assert.equal(first.remainingAttempts, MAX_FAILED_ATTEMPTS - 1);
    assert.equal(third.banned, true);
    assert.equal(third.remainingAttempts, 0);
    assert.ok(third.bannedUntil);
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
