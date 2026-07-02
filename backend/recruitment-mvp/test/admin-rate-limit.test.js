const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { createRateLimiter } = require("../admin-rate-limit");

describe("admin-rate-limit", () => {
  it("bloque apres le quota de requetes", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 3,
      name: "test",
      cleanupIntervalMs: 0
    });

    const now = Date.now();
    assert.equal(limiter.consume("client-a", now).allowed, true);
    assert.equal(limiter.consume("client-a", now).allowed, true);
    assert.equal(limiter.consume("client-a", now).allowed, true);
    assert.equal(limiter.consume("client-a", now).allowed, false);

    limiter.destroy();
  });

  it("isole les compteurs par cle", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      name: "test",
      cleanupIntervalMs: 0
    });

    const now = Date.now();
    assert.equal(limiter.consume("client-a", now).allowed, true);
    assert.equal(limiter.consume("client-b", now).allowed, true);
    assert.equal(limiter.consume("client-a", now).allowed, false);

    limiter.destroy();
  });
});
