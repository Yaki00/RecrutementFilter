import { describe, expect, it } from "vitest";
import {
  getChoiceForSide,
  isFitAnswer,
  normalizeQuestion,
  normalizeQuestionsPayload
} from "./questions.js";

describe("questions", () => {
  it("normalise une question oui/non", () => {
    const question = normalizeQuestion(
      {
        id: "q1",
        text: "Tu aimes coder ?",
        type: "yes_no",
        fitSide: "left"
      },
      0
    );

    expect(question.left.label).toBe("Oui");
    expect(question.right.label).toBe("Non");
    expect(question.fitSide).toBe("left");
  });

  it("normalise une question a deux choix personnalises", () => {
    const question = normalizeQuestion(
      {
        id: "q2",
        text: "Mode de travail ?",
        type: "choice",
        left: { label: "Présentiel", value: "onsite" },
        right: { label: "Remote", value: "remote" },
        fitSide: "right"
      },
      1
    );

    expect(question.left.label).toBe("Présentiel");
    expect(question.right.label).toBe("Remote");
    expect(question.fitSide).toBe("right");
  });

  it("valide le payload json complet", () => {
    const questions = normalizeQuestionsPayload({
      questions: [
        {
          id: "q1",
          text: "Question test",
          type: "yes_no",
          fitSide: "left"
        }
      ]
    });

    expect(questions).toHaveLength(1);
  });

  it("retourne le bon choix selon le cote", () => {
    const question = normalizeQuestion(
      {
        text: "Choix",
        type: "choice",
        left: { label: "A", value: "a" },
        right: { label: "B", value: "b" },
        fitSide: "left"
      },
      0
    );

    expect(getChoiceForSide(question, "left").label).toBe("A");
    expect(isFitAnswer(question, "left")).toBe(true);
    expect(isFitAnswer(question, "right")).toBe(false);
  });

  it("ne penalise pas une question neutre sans bonne reponse", () => {
    const question = normalizeQuestion(
      {
        text: "Preference",
        type: "choice",
        left: { label: "IA", value: "ia" },
        right: { label: "Full stack", value: "fullstack" },
        scored: false
      },
      1
    );

    expect(question.scored).toBe(false);
    expect(isFitAnswer(question, "left")).toBe(true);
    expect(isFitAnswer(question, "right")).toBe(true);
    expect(isFitAnswer(question, null)).toBe(true);
  });
});
