import { describe, expect, it } from "vitest";
import {
  getProfileUiState,
  getRegisterErrorMessage,
  isEpitechEmail,
  isRegisterResponseValid,
  isProfileFormFullyComplete,
  canRegisterProfile,
  normalizeEmail,
  validateProfileFields
} from "./profile-form.js";

const validFields = {
  firstName: "Alice",
  lastName: "Martin",
  email: "alice.martin@epitech.eu",
  specialty: "IA"
};

describe("profile-form", () => {
  it("normalise l'email en minuscules", () => {
    expect(normalizeEmail("  Alice.Martin@EPITECH.EU ")).toBe("alice.martin@epitech.eu");
  });

  it("valide un email epitech.eu", () => {
    expect(isEpitechEmail("prenom.nom@epitech.eu")).toBe(true);
    expect(isEpitechEmail("prenom.nom@gmail.com")).toBe(false);
    expect(isEpitechEmail("prenom.nom@epitech.eu.fr")).toBe(false);
  });

  it("accepte un profil complet valide", () => {
    const result = validateProfileFields(validFields);
    expect(result.isValid).toBe(true);
    expect(result.normalized.email).toBe("alice.martin@epitech.eu");
  });

  it("refuse une specialite hors liste", () => {
    const result = validateProfileFields({ ...validFields, specialty: "Dev" });
    expect(result.isValid).toBe(false);
    expect(result.errors.specialty).toBeTruthy();
  });

  it("refuse un profil incomplet", () => {
    const result = validateProfileFields({
      firstName: "A",
      lastName: "",
      email: "test@gmail.com",
      specialty: ""
    });

    expect(result.isValid).toBe(false);
    expect(result.errors.firstName).toBeTruthy();
    expect(result.errors.lastName).toBeTruthy();
    expect(result.errors.email).toBeTruthy();
    expect(result.errors.specialty).toBeTruthy();
  });

  it("desactive le bouton tant que le formulaire est invalide", () => {
    expect(getProfileUiState(validFields).submitDisabled).toBe(false);
    expect(getProfileUiState({ ...validFields, email: "bad@mail.com" }).submitDisabled).toBe(true);
  });

  it("n'affiche les erreurs qu'apres interaction ou soumission", () => {
    const invalid = { firstName: "A", lastName: "", email: "", specialty: "" };
    const hidden = getProfileUiState(invalid);
    const afterBlur = getProfileUiState(invalid, { touched: { firstName: true } });
    const afterSubmit = getProfileUiState(invalid, { submitAttempted: true });

    expect(Object.keys(hidden.visibleErrors)).toHaveLength(0);
    expect(afterBlur.visibleErrors.firstName).toBeTruthy();
    expect(afterBlur.visibleErrors.lastName).toBeUndefined();
    expect(Object.keys(afterSubmit.visibleErrors).length).toBeGreaterThan(1);
  });

  it("explique clairement les erreurs d'enregistrement API", () => {
    expect(getRegisterErrorMessage(404, {})).toContain("Service indisponible");
    expect(getRegisterErrorMessage(409, {})).toContain("déjà été utilisée");
    expect(getRegisterErrorMessage(500, { error: "Boom" })).toBe("Boom");
  });

  it("n'autorise l'enregistrement qu'apres validation complete explicite", () => {
    const fields = {
      firstName: "Alice",
      lastName: "Martin",
      email: "alice@epitech.eu",
      specialty: "IA"
    };

    expect(canRegisterProfile(fields).allowed).toBe(false);
    expect(canRegisterProfile(fields, { explicitSubmit: true }).allowed).toBe(true);
    expect(
      canRegisterProfile({ ...fields, specialty: "" }, { explicitSubmit: true }).allowed
    ).toBe(false);
  });

  it("detecte un formulaire complet", () => {
    expect(
      isProfileFormFullyComplete({
        firstName: "Alice",
        lastName: "Martin",
        email: "alice@epitech.eu",
        specialty: "IOT"
      })
    ).toBe(true);
    expect(
      isProfileFormFullyComplete({
        firstName: "Alice",
        lastName: "",
        email: "alice@epitech.eu",
        specialty: "IOT"
      })
    ).toBe(false);
  });

  it("valide la reponse d'enregistrement candidat", () => {
    expect(
      isRegisterResponseValid(
        { ok: true },
        {
          ok: true,
          candidateId: "abc",
          candidateToken: "token",
          profile: { email: "a@epitech.eu" }
        }
      )
    ).toBe(true);
    expect(isRegisterResponseValid({ ok: true }, { ok: true })).toBe(false);
    expect(isRegisterResponseValid({ ok: false }, {})).toBe(false);
  });
});
