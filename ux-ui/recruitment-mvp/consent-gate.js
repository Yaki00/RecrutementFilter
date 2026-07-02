export function isReadingCompleted(scrollState, unlockThresholdPx = 120, minScrollRatio = 0.92) {
  const { scrollTop, clientHeight, scrollHeight } = scrollState;
  const visibleBottom = scrollTop + clientHeight;
  const totalHeight = scrollHeight || 1;
  const scrollRatio = visibleBottom / totalHeight;
  return visibleBottom >= totalHeight - unlockThresholdPx || scrollRatio >= minScrollRatio;
}

export function shouldRequireScroll(scrollHeight, clientHeight, tolerancePx = 8) {
  return scrollHeight > clientHeight + tolerancePx;
}

export function getConsentUiState({
  consentReadingCompleted,
  consentChecked
}) {
  // Keep checkbox clickable to avoid blocked UX on some browsers/devices.
  const checkboxDisabled = false;
  const startButtonDisabled = !consentReadingCompleted || !consentChecked;
  const progressText = consentReadingCompleted
    ? "Lecture RGPD validée. Vous pouvez cocher le consentement."
    : "Descendez en bas du texte RGPD pour déverrouiller le consentement.";

  return { checkboxDisabled, startButtonDisabled, progressText };
}
