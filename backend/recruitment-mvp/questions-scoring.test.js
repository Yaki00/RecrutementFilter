const assert = require("node:assert/strict");
const path = require("path");
const { describe, it } = require("node:test");
const {
  loadQuestionsFromFile,
  processSessionSubmission,
  verdictFromScoredResult
} = require("./questions-scoring");

const questionsPath = path.resolve(__dirname, "../../ux-ui/recruitment-mvp/questions.json");

describe("questions-scoring", () => {
  const questions = loadQuestionsFromFile(questionsPath);

  it("recalcule le verdict côté serveur", () => {
    const answers = questions.map((question) => ({
      questionId: question.id,
      selectedSide: question.fitSide,
      responseTimeMs: 1000
    }));

    const result = processSessionSubmission(questions, answers);
    assert.equal(result.ok, true);
    assert.equal(result.answers.length, questions.length);
    assert.ok(result.score >= 0);
    assert.ok(["Encourageant", "Mitigé", "Non retenu"].includes(result.verdict));
  });

  it("ignore un verdict client falsifié", () => {
    const answers = questions.map((question) => ({
      questionId: question.id,
      selectedSide: question.fitSide === "left" ? "right" : "left",
      isFit: true,
      responseTimeMs: 500
    }));

    const result = processSessionSubmission(questions, answers);
    assert.equal(result.ok, true);
    assert.equal(result.verdict, "Non retenu");
    assert.ok(result.score < result.scoredTotal);
  });

  it("traite les questions non notées comme toujours conformes", () => {
    const profileQuestion = questions.find((question) => question.scored === false);
    assert.ok(profileQuestion);

    const answers = questions.map((question) => ({
      questionId: question.id,
      selectedSide: question.id === profileQuestion.id ? "right" : question.fitSide,
      responseTimeMs: 800
    }));

    const result = processSessionSubmission(questions, answers);
    const evaluated = result.answers.find((answer) => answer.questionId === profileQuestion.id);
    assert.equal(evaluated.isFit, true);
    assert.equal(evaluated.scored, false);
  });

  it("refuse un nombre de réponses incorrect", () => {
    const result = processSessionSubmission(questions, []);
    assert.equal(result.ok, false);
  });

  it("calcule les seuils de verdict", () => {
    assert.equal(verdictFromScoredResult(8, 8), "Encourageant");
    assert.equal(verdictFromScoredResult(4, 8), "Mitigé");
    assert.equal(verdictFromScoredResult(1, 8), "Non retenu");
  });
});
