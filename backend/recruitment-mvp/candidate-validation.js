const EPITECH_EMAIL_PATTERN = /^[^\s@]+@epitech\.eu$/;
const SPECIALTY_OPTIONS = ["IOT", "IA", "Cybersécurité"];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function validateCandidatePayload(payload) {
  const firstName = normalizeName(payload.firstName);
  const lastName = normalizeName(payload.lastName);
  const email = normalizeEmail(payload.email);
  const specialty = normalizeName(payload.specialty);

  const errors = {};

  if (firstName.length < 2 || firstName.length > 80) {
    errors.firstName = "Le prénom est requis.";
  }
  if (lastName.length < 2 || lastName.length > 80) {
    errors.lastName = "Le nom est requis.";
  }
  if (!email) {
    errors.email = "L'adresse email est requise.";
  } else if (!EPITECH_EMAIL_PATTERN.test(email)) {
    errors.email = "L'email doit se terminer par @epitech.eu.";
  }
  if (!SPECIALTY_OPTIONS.includes(specialty)) {
    errors.specialty = "Merci de choisir une spécialité.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: { firstName, lastName, email, specialty }
  };
}

module.exports = {
  EPITECH_EMAIL_PATTERN,
  SPECIALTY_OPTIONS,
  normalizeEmail,
  normalizeName,
  validateCandidatePayload
};
