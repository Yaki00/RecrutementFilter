export const QUESTION_TIMEOUT_MS = 15000;

export function isQuestionTimedOut(elapsedMs, timeoutMs = QUESTION_TIMEOUT_MS) {
  return elapsedMs >= timeoutMs;
}

export function countScoredQuestions(questions) {
  if (!Array.isArray(questions)) return 0;
  return questions.filter((question) => question.scored !== false).length;
}

export function computeSessionScore(questions, answers) {
  let score = 0;
  let scoredTotal = 0;

  for (let index = 0; index < answers.length; index += 1) {
    const question = questions[index];
    if (!question || question.scored === false) continue;
    scoredTotal += 1;
    if (answers[index]?.isFit) score += 1;
  }

  return { score, scoredTotal };
}

export function verdictFromScoredResult(score, scoredTotal) {
  if (scoredTotal <= 0) return "Mitigé";

  const encouragingThreshold = Math.max(5, Math.ceil(scoredTotal * 0.75));
  const mitigeThreshold = Math.max(3, Math.ceil(scoredTotal * 0.5));

  if (score >= encouragingThreshold) return "Encourageant";
  if (score >= mitigeThreshold) return "Mitigé";
  return "Non retenu";
}

export function getQuestionRemainingMs(elapsedMs, timeoutMs = QUESTION_TIMEOUT_MS) {
  return Math.max(0, timeoutMs - elapsedMs);
}
