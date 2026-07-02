import { describe, expect, it } from "vitest";
import {
  ONBOARDING_STEPS,
  getNextOnboardingStep,
  getOnboardingUiState,
  getPreviousOnboardingStep
} from "./onboarding.js";

describe("onboarding", () => {
  it("expose 3 etapes d'introduction", () => {
    expect(ONBOARDING_STEPS).toHaveLength(3);
  });

  it("affiche Suivant puis Commencer sur la derniere carte", () => {
    expect(getOnboardingUiState(0).nextLabel).toBe("Suivant");
    expect(getOnboardingUiState(2).nextLabel).toBe("Commencer l'expérience");
    expect(getOnboardingUiState(2).isLastStep).toBe(true);
  });

  it("avance d'une carte a la suivante", () => {
    expect(getNextOnboardingStep(0)).toBe(1);
    expect(getNextOnboardingStep(2)).toBe(2);
  });

  it("recule d'une carte", () => {
    expect(getPreviousOnboardingStep(2)).toBe(1);
    expect(getPreviousOnboardingStep(0)).toBe(0);
  });
});
