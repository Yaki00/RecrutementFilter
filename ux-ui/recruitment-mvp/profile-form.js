const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 80;

export const SPECIALTY_OPTIONS = ["IOT", "IA", "Cybersécurité"];

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function isEpitechEmail(email) {
  const normalized = normalizeEmail(email);
  return /^[^\s@]+@epitech\.eu$/.test(normalized);
}

function normalizeName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

export function validateProfileFields(fields) {
  const firstName = normalizeName(fields.firstName);
  const lastName = normalizeName(fields.lastName);
  const email = normalizeEmail(fields.email);
  const specialty = normalizeName(fields.specialty);

  const errors = {};

  if (firstName.length < NAME_MIN_LENGTH || firstName.length > NAME_MAX_LENGTH) {
    errors.firstName = "Le prénom est requis (2 caractères minimum).";
  }

  if (lastName.length < NAME_MIN_LENGTH || lastName.length > NAME_MAX_LENGTH) {
    errors.lastName = "Le nom est requis (2 caractères minimum).";
  }

  if (!email) {
    errors.email = "L'adresse email est requise.";
  } else if (!isEpitechEmail(email)) {
    errors.email = "L'email doit se terminer par @epitech.eu.";
  }

  if (!SPECIALTY_OPTIONS.includes(specialty)) {
    errors.specialty = "Merci de choisir une spécialité.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: {
      firstName,
      lastName,
      email,
      specialty
    }
  };
}

export function isProfileFormFullyComplete(fields) {
  return validateProfileFields(fields).isValid;
}

export function canRegisterProfile(fields, { explicitSubmit = false } = {}) {
  const validation = validateProfileFields(fields);

  if (!explicitSubmit || !validation.isValid) {
    return {
      allowed: false,
      validation,
      errors: validation.errors
    };
  }

  return {
    allowed: true,
    validation,
    errors: {}
  };
}

export function getProfileUiState(fields, options = {}) {
  const { touched = {}, submitAttempted = false } = options;
  const validation = validateProfileFields(fields);
  const visibleErrors = {};

  for (const [fieldName, message] of Object.entries(validation.errors)) {
    if (submitAttempted || touched[fieldName]) {
      visibleErrors[fieldName] = message;
    }
  }

  return {
    submitDisabled: !validation.isValid,
    errors: validation.errors,
    visibleErrors,
    normalized: validation.normalized
  };
}

export function getRegisterErrorMessage(status, data = {}) {
  if (status === 409) {
    return (
      data.error ||
      "Cette adresse email a déjà été utilisée pour une participation."
    );
  }

  if (status === 400 && data.fieldErrors) {
    return data.error || "Merci de corriger les champs indiqués.";
  }

  if (status === 404) {
    return "Service indisponible. Ouvrez l'application via le backend (npm start sur le port 8080).";
  }

  if (status >= 500) {
    return data.error || "Erreur serveur. Réessayez dans quelques instants.";
  }

  return data.error || "Impossible d'enregistrer votre profil.";
}

export function isRegisterResponseValid(response, data = {}) {
  return Boolean(response?.ok && data?.ok && data?.candidateId && data?.candidateToken);
}
