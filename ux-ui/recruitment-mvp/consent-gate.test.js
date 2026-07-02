import { describe, expect, it } from "vitest";
import {
  getConsentUiState,
  isReadingCompleted,
  shouldRequireScroll
} from "./consent-gate.js";

describe("consent-gate", () => {
  describe("isReadingCompleted", () => {
    it("reste verrouille tant que le scroll est insuffisant", () => {
      const result = isReadingCompleted({
        scrollTop: 80,
        clientHeight: 400,
        scrollHeight: 1000
      });
      expect(result).toBe(false);
    });

    it("deverrouille quand on atteint la zone basse (threshold px)", () => {
      const result = isReadingCompleted({
        scrollTop: 500,
        clientHeight: 400,
        scrollHeight: 1000
      });
      expect(result).toBe(true);
    });

    it("deverrouille quand le ratio de scroll depasse 92%", () => {
      const result = isReadingCompleted({
        scrollTop: 520,
        clientHeight: 400,
        scrollHeight: 1000
      });
      expect(result).toBe(true);
    });
  });

  describe("shouldRequireScroll", () => {
    it("demande un scroll si le contenu depasse la hauteur visible", () => {
      expect(shouldRequireScroll(900, 600)).toBe(true);
    });

    it("n'exige pas de scroll si le contenu tient dans le viewport", () => {
      expect(shouldRequireScroll(605, 600)).toBe(false);
    });
  });

  describe("getConsentUiState", () => {
    it("laisse la checkbox cliquable mais bloque le bouton avant lecture RGPD", () => {
      const ui = getConsentUiState({
        consentReadingCompleted: false,
        consentChecked: false
      });
      expect(ui.checkboxDisabled).toBe(false);
      expect(ui.startButtonDisabled).toBe(true);
      expect(ui.progressText).toContain("Descendez en bas");
    });

    it("active la checkbox mais garde le bouton bloque si case non cochee", () => {
      const ui = getConsentUiState({
        consentReadingCompleted: true,
        consentChecked: false
      });
      expect(ui.checkboxDisabled).toBe(false);
      expect(ui.startButtonDisabled).toBe(true);
      expect(ui.progressText).toContain("Lecture RGPD valid");
    });

    it("active le bouton quand lecture terminee et case cochee", () => {
      const ui = getConsentUiState({
        consentReadingCompleted: true,
        consentChecked: true
      });
      expect(ui.checkboxDisabled).toBe(false);
      expect(ui.startButtonDisabled).toBe(false);
    });
  });
});
