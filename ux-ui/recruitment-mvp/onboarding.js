export const ONBOARDING_STEPS = [
  {
    eyebrow: "Avant de commencer",
    title: "Qu'est-ce que ce questionnaire ?",
    body:
      "Il s'agit d'une préqualification MIRA pour le projet de miroir connecté. " +
      "L'objectif est d'évaluer ton profil technique et ta motivation à rejoindre l'équipe, " +
      "à travers une série de questions courtes sur l'IA, l'IoT et le cloud."
  },
  {
    eyebrow: "Mode d'emploi",
    title: "Comment ça marche ?",
    body:
      "La caméra détecte l'inclinaison de ta tête : gauche ou droite pour choisir une réponse. " +
      "Chaque question affiche deux options. Maintiens l'inclinaison quelques instants pour valider. " +
      "Tu as 15 secondes maximum par question."
  },
  {
    eyebrow: "Dernier conseil",
    title: "Installe-toi dans un endroit calme",
    body:
      "Place-toi face à la caméra, dans un lieu silencieux et bien éclairé. " +
      "Évite les mouvements brusques autour de toi pour que la détection reste fiable. " +
      "Quand tu es prêt, lance l'expérience."
  }
];

export function getOnboardingUiState(stepIndex, totalSteps = ONBOARDING_STEPS.length) {
  const safeIndex = Math.min(Math.max(0, stepIndex), totalSteps - 1);
  const isLastStep = safeIndex >= totalSteps - 1;

  return {
    stepIndex: safeIndex,
    totalSteps,
    isLastStep,
    isFirstStep: safeIndex === 0,
    showBackButton: true,
    nextLabel: isLastStep ? "Commencer l'expérience" : "Suivant",
    progressLabel: `Étape ${safeIndex + 1} / ${totalSteps}`
  };
}

export function getPreviousOnboardingStep(stepIndex) {
  if (stepIndex <= 0) return 0;
  return stepIndex - 1;
}

export function getNextOnboardingStep(stepIndex, totalSteps = ONBOARDING_STEPS.length) {
  if (stepIndex >= totalSteps - 1) return stepIndex;
  return stepIndex + 1;
}
