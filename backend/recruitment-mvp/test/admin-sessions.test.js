const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { after, before, describe, it } = require("node:test");
const { createDbAdminSessionStore } = require("../admin-sessions");
const { openDatabase } = require("../db");

let db;
let dbPath;
let sessionStore;

before(() => {
  dbPath = path.join(os.tmpdir(), `mira-admin-sessions-test-${Date.now()}.db`);
  db = openDatabase(dbPath);
  sessionStore = createDbAdminSessionStore(db);
});

after(async () => {
  await new Promise((resolve) => db.close(resolve));
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
});

describe("admin-sessions", () => {
  it("cree et valide une session persistee", async () => {
    const session = await sessionStore.create("10.0.0.1");
    assert.ok(session.token);
    assert.ok(session.expiresAt);
    assert.equal(await sessionStore.isValid(session.token), true);
  });

  it("revoque une session", async () => {
    const session = await sessionStore.create("10.0.0.2");
    await sessionStore.revoke(session.token);
    assert.equal(await sessionStore.isValid(session.token), false);
  });
});
