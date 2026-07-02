const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const { computeKpis } = require("../admin-kpis");

describe("admin-kpis", () => {
  it("calcule les indicateurs principaux", () => {
    const kpis = computeKpis([
      {
        specialty: "IA",
        sessions: [
          {
            sessionId: "s1",
            score: 8,
            verdict: "Encourageant",
            answers: [
              { responseTimeMs: 1000, isFit: true, scored: true, timedOut: false },
              { responseTimeMs: 2000, isFit: false, scored: true, timedOut: false }
            ]
          }
        ]
      },
      {
        specialty: "IOT",
        sessions: []
      }
    ]);

    assert.equal(kpis.registeredCount, 2);
    assert.equal(kpis.completedCount, 1);
    assert.equal(kpis.pendingCount, 1);
    assert.equal(kpis.completionRate, 50);
    assert.equal(kpis.averageScore, 8);
    assert.equal(kpis.accuracyRate, 50);
    assert.equal(kpis.specialtyCounts.IA, 1);
    assert.equal(kpis.verdictCounts.Encourageant, 1);
  });
});
