const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { createCandidateToken, verifyCandidateToken } = require("./candidate-auth");

const secret = "test-candidate-secret";
const candidateId = "11111111-1111-1111-1111-111111111111";

describe("candidate-auth", () => {
  it("crée et vérifie un jeton candidat", () => {
    const token = createCandidateToken(candidateId, secret);
    assert.equal(verifyCandidateToken(token, candidateId, secret), true);
  });

  it("refuse un jeton pour un autre candidat", () => {
    const token = createCandidateToken(candidateId, secret);
    assert.equal(
      verifyCandidateToken(token, "22222222-2222-2222-2222-222222222222", secret),
      false
    );
  });

  it("refuse un jeton expiré", () => {
    const token = createCandidateToken(candidateId, secret, -1000);
    assert.equal(verifyCandidateToken(token, candidateId, secret), false);
  });
});
