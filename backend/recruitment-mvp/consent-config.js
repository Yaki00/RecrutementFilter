const CONSENT_VERSION = "rgpd-v1";

function validateConsentPayload(consent) {
  const given = Boolean(consent?.given);
  const version = String(consent?.version || "").trim();
  const at = String(consent?.at || "").trim();

  const errors = {};

  if (!given) {
    errors.given = "Le consentement RGPD est requis.";
  }
  if (version !== CONSENT_VERSION) {
    errors.version = "Version de consentement invalide.";
  }
  if (!at || Number.isNaN(Date.parse(at))) {
    errors.at = "Horodatage de consentement invalide.";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    normalized: Object.keys(errors).length === 0
      ? {
          given: true,
          version: CONSENT_VERSION,
          at: new Date(at).toISOString()
        }
      : null
  };
}

module.exports = {
  CONSENT_VERSION,
  validateConsentPayload
};
