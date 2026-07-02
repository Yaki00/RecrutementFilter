import { describe, expect, it } from "vitest";
import {
  QUESTION_TIMEOUT_MS,
  computeSessionScore,
  getQuestionRemainingMs,
  isQuestionTimedOut,
  verdictFromScoredResult
} from "./question-timing.js";

describe("question-timing", () => {
  it("detecte un timeout a 15 secondes", () => {
    expect(isQuestionTimedOut(14999)).toBe(false);
    expect(isQuestionTimedOut(15000)).toBe(true);
    expect(QUESTION_TIMEOUT_MS).toBe(15000);
  });

  it("calcule le temps restant", () => {
    expect(getQuestionRemainingMs(4000)).toBe(11000);
    expect(getQuestionRemainingMs(20000)).toBe(0);
  });

  it("ne score que les questions marquees scored", () => {
    const questions = [
      { id: "q1", scored: true },
      { id: "q2", scored: false },
      { id: "q3", scored: true }
    ];
    const answers = [
      { isFit: true },
      { isFit: false },
      { isFit: false }
    ];

    expect(computeSessionScore(questions, answers)).toEqual({
      score: 1,
      scoredTotal: 2
    });
  });

  it("calcule un verdict sur les questions scorees uniquement", () => {
    expect(verdictFromScoredResult(8, 10)).toBe("Encourageant");
    expect(verdictFromScoredResult(5, 10)).toBe("Mitigé");
    expect(verdictFromScoredResult(2, 10)).toBe("Non retenu");
  });
});
