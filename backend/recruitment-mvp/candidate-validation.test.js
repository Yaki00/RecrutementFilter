const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");
const { validateCandidatePayload } = require("./candidate-validation");

describe("candidate-validation", () => {
  it("accepte un candidat epitech valide", () => {
    const result = validateCandidatePayload({
      firstName: "zeaz",
      lastName: "ezae",
      email: "azeaez@epitech.eu",
      specialty: "IOT"
    });

    assert.equal(result.isValid, true);
    assert.equal(result.normalized.email, "azeaez@epitech.eu");
  });

  it("refuse un email hors epitech.eu", () => {
    const result = validateCandidatePayload({
      firstName: "Alice",
      lastName: "Martin",
      email: "alice@gmail.com",
      specialty: "IA"
    });

    assert.equal(result.isValid, false);
    assert.ok(result.errors.email);
  });

  it("refuse une specialite hors liste", () => {
    const result = validateCandidatePayload({
      firstName: "Alice",
      lastName: "Martin",
      email: "alice@epitech.eu",
      specialty: "Dev"
    });

    assert.equal(result.isValid, false);
    assert.ok(result.errors.specialty);
  });
});
