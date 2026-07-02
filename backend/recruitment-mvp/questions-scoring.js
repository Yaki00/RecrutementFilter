const fs = require("fs");
const path = require("path");

const YES_NO_DEFAULTS = {
  left: { label: "Oui", value: "yes" },
  right: { label: "Non", value: "no" }
};

function normalizeChoice(choice, fallback) {
  const label = String(choice?.label || fallback.label).trim();
  const value = String(choice?.value || fallback.value).trim();
  return { label, value };
}

function normalizeQuestion(raw, index) {
  const id = String(raw?.id || `q${index + 1}`).trim();
  const text = String(raw?.text || "").trim();
  const type = raw?.type === "choice" ? "choice" : "yes_no";
  const defaults = type === "yes_no" ? YES_NO_DEFAULTS : null;
  const left = normalizeChoice(raw?.left, defaults?.left || { label: "Option gauche", value: "left" });
  const right = normalizeChoice(
    raw?.right,
    defaults?.right || { label: "Option droite", value: "right" }
  );
  const fitSide = raw?.fitSide === "right" ? "right" : "left";
  const scored = raw?.scored === false ? false : true;

  return { id, text, type, left, right, fitSide, scored };
}

function loadQuestionsFromFile(questionsPath) {
  const raw = fs.readFileSync(questionsPath, "utf8");
  const payload = JSON.parse(raw);
  if (!payload?.questions?.length) {
    throw new Error("questions.json invalide.");
  }
  return payload.questions.map((question, index) => normalizeQuestion(question, index));
}

function getChoiceForSide(question, side) {
  return side === "right" ? question.right : question.left;
}

function evaluateAnswer(question, clientAnswer = {}) {
  const selectedSide = clientAnswer.selectedSide || null;
  const timedOut = Boolean(clientAnswer.timedOut);
  const selectedChoice = selectedSide ? getChoiceForSide(question, selectedSide) : null;

  if (question.scored === false) {
    return {
      questionId: question.id,
      questionText: question.text,
      expectedSide: null,
      selectedSide,
      selectedLabel: selectedChoice?.label || clientAnswer.selectedLabel || null,
      selectedValue: selectedChoice?.value || clientAnswer.selectedValue || null,
      isFit: true,
      scored: false,
      timedOut,
      responseTimeMs: Number(clientAnswer.responseTimeMs) || 0
    };
  }

  const isFit = Boolean(selectedSide) && !timedOut && selectedSide === question.fitSide;
  const expectedChoice = getChoiceForSide(question, question.fitSide);

  return {
    questionId: question.id,
    questionText: question.text,
    expectedSide: question.fitSide,
    expectedLabel: expectedChoice.label,
    selectedSide,
    selectedLabel: selectedChoice?.label || clientAnswer.selectedLabel || (timedOut ? "Temps écoulé" : null),
    selectedValue: selectedChoice?.value || clientAnswer.selectedValue || (timedOut ? "timeout" : null),
    isFit,
    scored: true,
    timedOut,
    responseTimeMs: Number(clientAnswer.responseTimeMs) || 0
  };
}

function computeSessionScore(evaluatedAnswers, questions) {
  let score = 0;
  let scoredTotal = 0;

  for (const question of questions) {
    if (question.scored === false) continue;
    scoredTotal += 1;
    const answer = evaluatedAnswers.find((item) => item.questionId === question.id);
    if (answer?.isFit) score += 1;
  }

  return { score, scoredTotal };
}

function verdictFromScoredResult(score, scoredTotal) {
  if (scoredTotal <= 0) return "Mitigé";

  const encouragingThreshold = Math.max(5, Math.ceil(scoredTotal * 0.75));
  const mitigeThreshold = Math.max(3, Math.ceil(scoredTotal * 0.5));

  if (score >= encouragingThreshold) return "Encourageant";
  if (score >= mitigeThreshold) return "Mitigé";
  return "Non retenu";
}

function processSessionSubmission(questions, clientAnswers) {
  if (!Array.isArray(clientAnswers) || clientAnswers.length !== questions.length) {
    return {
      ok: false,
      error: `Nombre de réponses invalide (${clientAnswers?.length || 0}/${questions.length}).`
    };
  }

  const answersById = new Map(
    clientAnswers.map((answer) => [String(answer.questionId || ""), answer])
  );

  const evaluatedAnswers = [];

  for (const question of questions) {
    const clientAnswer = answersById.get(question.id);
    if (!clientAnswer) {
      return {
        ok: false,
        error: `Réponse manquante pour ${question.id}.`
      };
    }
    evaluatedAnswers.push(evaluateAnswer(question, clientAnswer));
  }

  const { score, scoredTotal } = computeSessionScore(evaluatedAnswers, questions);
  const verdict = verdictFromScoredResult(score, scoredTotal);

  return {
    ok: true,
    answers: evaluatedAnswers,
    score,
    scoredTotal,
    totalQuestions: questions.length,
    verdict
  };
}

module.exports = {
  loadQuestionsFromFile,
  normalizeQuestion,
  evaluateAnswer,
  computeSessionScore,
  verdictFromScoredResult,
  processSessionSubmission
};
