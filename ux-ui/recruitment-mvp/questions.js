const YES_NO_DEFAULTS = {
  left: { label: "Oui", value: "yes" },
  right: { label: "Non", value: "no" }
};

function normalizeChoice(choice, fallback) {
  const label = String(choice?.label || fallback.label).trim();
  const value = String(choice?.value || fallback.value).trim();
  if (!label) {
    throw new Error("Chaque choix doit avoir un label.");
  }
  return { label, value };
}

export function normalizeQuestion(raw, index) {
  const id = String(raw?.id || `q${index + 1}`).trim();
  const text = String(raw?.text || "").trim();
  const type = raw?.type === "choice" ? "choice" : "yes_no";

  if (!text) {
    throw new Error(`Question ${id}: le champ text est obligatoire.`);
  }

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

export function normalizeQuestionsPayload(payload) {
  if (!payload || !Array.isArray(payload.questions) || payload.questions.length === 0) {
    throw new Error("Le fichier questions.json doit contenir un tableau questions non vide.");
  }

  return payload.questions.map((question, index) => normalizeQuestion(question, index));
}

export async function loadQuestions(url = "./questions.json") {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Impossible de charger ${url} (${response.status}).`);
  }

  const payload = await response.json();
  return normalizeQuestionsPayload(payload);
}

export function getChoiceForSide(question, side) {
  return side === "right" ? question.right : question.left;
}

export function isFitAnswer(question, selectedSide) {
  if (question.scored === false) return true;
  if (!selectedSide) return false;
  return selectedSide === question.fitSide;
}

export function isScoredQuestion(question) {
  return question?.scored !== false;
}
