import { describe, expect, it } from "vitest";
import {
  applyMoodToScreen,
  countBadAnswers,
  getMoodState,
  getMoodStateFromAnswers
} from "./ambience-mood.js";

describe("ambience-mood", () => {
  describe("countBadAnswers", () => {
    it("compte uniquement les reponses non conformes", () => {
      const answers = [{ isFit: true }, { isFit: false }, { isFit: false }];
      expect(countBadAnswers(answers)).toBe(2);
    });
  });

  describe("getMoodState", () => {
    it("reste calme avec moins de 2 mauvaises reponses", () => {
      expect(getMoodState(0)).toEqual({ mood: "calm", intensity: 0 });
      expect(getMoodState(1)).toEqual({ mood: "calm", intensity: 0 });
    });

    it("active un degrade visible des 2 mauvaises reponses", () => {
      expect(getMoodState(2)).toEqual({ mood: "gradient", intensity: 0.3 });
      expect(getMoodState(3)).toEqual({ mood: "gradient", intensity: 0.55 });
      expect(getMoodState(4)).toEqual({ mood: "gradient", intensity: 0.8 });
    });

    it("passe en mode hard a partir de 5 mauvaises reponses", () => {
      expect(getMoodState(5)).toEqual({ mood: "hard", intensity: 1 });
      expect(getMoodState(8)).toEqual({ mood: "hard", intensity: 1 });
    });
  });

  describe("getMoodStateFromAnswers", () => {
    it("derive le mood depuis les reponses de session", () => {
      const answers = [
        { isFit: false },
        { isFit: false },
        { isFit: false },
        { isFit: false },
        { isFit: false }
      ];
      expect(getMoodStateFromAnswers(answers)).toEqual({ mood: "hard", intensity: 1 });
    });
  });

  describe("applyMoodToScreen", () => {
    it("applique data-mood et --bg-intensity sur l'ecran experience", () => {
      const screen = {
        dataset: {},
        style: {
          properties: {},
          setProperty(name, value) {
            this.properties[name] = value;
          }
        }
      };

      applyMoodToScreen(screen, { mood: "gradient", intensity: 0.55 });

      expect(screen.dataset.mood).toBe("gradient");
      expect(screen.style.properties["--bg-intensity"]).toBe("0.55");
    });
  });
});
