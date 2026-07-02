export function countBadAnswers(answers) {
  if (!Array.isArray(answers)) return 0;
  return answers.reduce((count, answer) => count + (answer?.isFit ? 0 : 1), 0);
}

export function getMoodState(badAnswers) {
  const bad = Math.max(0, Number(badAnswers) || 0);

  if (bad >= 5) {
    return { mood: "hard", intensity: 1 };
  }

  if (bad >= 2) {
    // Visible from the 2nd bad answer: 2 -> 0.3, 3 -> 0.55, 4 -> 0.8
    const intensity = Math.min(0.9, 0.3 + (bad - 2) * 0.25);
    return { mood: "gradient", intensity };
  }

  return { mood: "calm", intensity: 0 };
}

export function getMoodStateFromAnswers(answers) {
  return getMoodState(countBadAnswers(answers));
}

export function applyMoodToScreen(screenElement, moodState) {
  if (!screenElement) return;

  screenElement.dataset.mood = moodState.mood;
  screenElement.style.setProperty("--bg-intensity", String(moodState.intensity));
}
