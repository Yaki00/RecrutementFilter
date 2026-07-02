import {
  getConsentUiState,
  isReadingCompleted,
  shouldRequireScroll
} from "./consent-gate.js";

const QUESTIONS = [
  { id: "q1", text: "Tu es à l'aise sur un projet IA concret ?", expectedSide: "left" },
  {
    id: "q2",
    text: "Tu préfères livrer une solution fonctionnelle plutôt qu'attendre la perfection ?",
    expectedSide: "left"
  },
  { id: "q3", text: "Tu sais documenter clairement tes choix techniques ?", expectedSide: "left" },
  { id: "q4", text: "Tu es à l'aise en équipe pluridisciplinaire ?", expectedSide: "left" },
  { id: "q5", text: "Tu sais prioriser sous contrainte de délai ?", expectedSide: "left" },
  { id: "q6", text: "Tu peux prendre des décisions techniques en autonomie ?", expectedSide: "left" },
  { id: "q7", text: "Tu acceptes des feedbacks rapides et fréquents ?", expectedSide: "left" },
  { id: "q8", text: "Vision IA + UX te motive au quotidien ?", expectedSide: "left" },
  { id: "q9", text: "Tu peux t'investir régulièrement sur la durée ?", expectedSide: "left" },
  { id: "q10", text: "Tu es prêt à présenter ton travail de façon structurée ?", expectedSide: "left" }
];

const CONSENT_SCREEN = document.querySelector("#consent-screen");
const EXPERIENCE_SCREEN = document.querySelector("#experience-screen");
const RESULT_SCREEN = document.querySelector("#result-screen");
const CONSENT_CHECKBOX = document.querySelector("#consent-checkbox");
const CONSENT_SCROLL = document.querySelector("#consent-scroll");
const CONSENT_PROGRESS = document.querySelector("#consent-progress");
const START_BUTTON = document.querySelector("#start-btn");
const RESTART_BUTTON = document.querySelector("#restart-btn");
const QUESTION_PILL = document.querySelector("#question-pill");
const RESULT_VERDICT = document.querySelector("#result-verdict");
const RESULT_MESSAGE = document.querySelector("#result-message");
const TILT_LEFT_FILL = document.querySelector("#tilt-left-fill");
const TILT_RIGHT_FILL = document.querySelector("#tilt-right-fill");
const TILT_TEXT = document.querySelector("#tilt-text");
const VIDEO = document.querySelector("#camera");
const CANVAS = document.querySelector("#overlay");
const AMBIENCE = document.querySelector("#ambience");
const CTX = CANVAS.getContext("2d");

let faceLandmarker;
let running = false;
let answers = [];
let currentQuestionIndex = 0;
let sessionId = crypto.randomUUID();
let questionStartedAt = 0;
let stableFrames = 0;
let lastDirection = "neutral";
let lockUntil = 0;
let requireNeutralReset = false;
let neutralResetFrames = 0;
let questionReadyAt = 0;
let candidateDirection = "neutral";
let directionHoldStart = 0;
let FaceLandmarkerClass;
let FilesetResolverClass;

const YAW_THRESHOLD = 0.09;
const STRONG_YAW = 0.15;
const REQUIRED_STABLE_FRAMES = 14;
const RESPONSE_COOLDOWN_MS = 1600;
const REQUIRED_NEUTRAL_FRAMES = 5;
const MIN_REACTION_MS = 700;
const CONFIRM_HOLD_MS = 520;
let consentReadingCompleted = false;

function refreshConsentControls() {
  const uiState = getConsentUiState({
    consentReadingCompleted,
    consentChecked: CONSENT_CHECKBOX.checked
  });
  CONSENT_CHECKBOX.disabled = uiState.checkboxDisabled;
  START_BUTTON.disabled = uiState.startButtonDisabled;
  if (CONSENT_PROGRESS) {
    CONSENT_PROGRESS.textContent = uiState.progressText;
  }
}

function handleConsentScroll() {
  if (consentReadingCompleted || !CONSENT_SCROLL) return;
  if (
    !isReadingCompleted({
      scrollTop: CONSENT_SCROLL.scrollTop,
      clientHeight: CONSENT_SCROLL.clientHeight,
      scrollHeight: CONSENT_SCROLL.scrollHeight
    })
  ) {
    return;
  }
  consentReadingCompleted = true;
  refreshConsentControls();
}

function initConsentGate() {
  if (!CONSENT_SCROLL) return;
  const requiresScroll = shouldRequireScroll(CONSENT_SCROLL.scrollHeight, CONSENT_SCROLL.clientHeight);
  consentReadingCompleted = !requiresScroll;
  refreshConsentControls();
}

function verdictFromScore(score) {
  if (score >= 8) return "Encourageant";
  if (score >= 5) return "Mitigé";
  return "Non retenu";
}

function messageFromVerdict(verdict) {
  if (verdict === "Encourageant") {
    return "Signal positif : ton profil semble bien aligné avec l'équipe MIRA.";
  }
  if (verdict === "Mitigé") {
    return "Profil à approfondir : plusieurs points sont intéressants mais restent à valider.";
  }
  return "Signal faible pour ce besoin précis, mais merci pour ta participation.";
}

function updateAmbience() {
  const score = answers.reduce((acc, a) => acc + (a.isFit ? 1 : 0), 0);
  const ratio = answers.length ? score / answers.length : 0.5;

  if (ratio >= 0.8) {
    AMBIENCE.style.background =
      "radial-gradient(circle at center, rgba(255, 247, 176, 0.24) 5%, rgba(18, 48, 98, 0.08) 64%, rgba(5, 9, 16, 0.2) 100%)";
    AMBIENCE.style.filter = "brightness(1.2) saturate(1.2)";
  } else if (ratio >= 0.5) {
    AMBIENCE.style.background =
      "radial-gradient(circle at center, rgba(179, 220, 255, 0.16) 10%, rgba(8, 20, 40, 0.18) 75%)";
    AMBIENCE.style.filter = "brightness(1.02) saturate(1)";
  } else {
    AMBIENCE.style.background =
      "radial-gradient(circle at center, rgba(80, 92, 117, 0.1) 0%, rgba(8, 10, 16, 0.42) 78%)";
    AMBIENCE.style.filter = "brightness(0.8) saturate(0.8) contrast(1.1)";
  }
}

function setQuestion() {
  const q = QUESTIONS[currentQuestionIndex];
  QUESTION_PILL.textContent = q ? q.text : "Calcul du résultat...";
  questionStartedAt = performance.now();
  questionReadyAt = questionStartedAt + MIN_REACTION_MS;
  candidateDirection = "neutral";
  directionHoldStart = 0;
  stableFrames = 0;
}

function resizeCanvas() {
  CANVAS.width = VIDEO.videoWidth || EXPERIENCE_SCREEN.clientWidth;
  CANVAS.height = VIDEO.videoHeight || EXPERIENCE_SCREEN.clientHeight;
}

function detectHeadPose(landmarks) {
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];
  if (!leftEye || !rightEye || !nose) {
    return { direction: "neutral", yaw: 0 };
  }

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeDist = Math.abs(rightEye.x - leftEye.x) || 1;
  const yaw = (nose.x - eyeMidX) / eyeDist;

  if (yaw > YAW_THRESHOLD) return { direction: "right", yaw };
  if (yaw < -YAW_THRESHOLD) return { direction: "left", yaw };
  return { direction: "neutral", yaw };
}

function resetTiltIndicator(text = "Inclinez franchement la tete pour valider") {
  TILT_LEFT_FILL.style.width = "0%";
  TILT_RIGHT_FILL.style.width = "0%";
  TILT_TEXT.textContent = text;
}

function updateTiltIndicator(yaw, direction) {
  const strength = Math.min(1, Math.abs(yaw) / STRONG_YAW);
  const percent = `${Math.round(strength * 50)}%`;

  if (direction === "left") {
    TILT_LEFT_FILL.style.width = percent;
    TILT_RIGHT_FILL.style.width = "0%";
    TILT_TEXT.textContent = `Gauche: ${Math.round(strength * 100)}%`;
    return;
  }
  if (direction === "right") {
    TILT_RIGHT_FILL.style.width = percent;
    TILT_LEFT_FILL.style.width = "0%";
    TILT_TEXT.textContent = `Droite: ${Math.round(strength * 100)}%`;
    return;
  }
  resetTiltIndicator(requireNeutralReset ? "Revenez au centre pour la prochaine question" : undefined);
}

function drawQuestionOverHead(landmarks) {
  CTX.clearRect(0, 0, CANVAS.width, CANVAS.height);
  if (!landmarks) return;

  const headTop = landmarks[10];
  if (!headTop) return;

  const x = (1 - headTop.x) * CANVAS.width;
  const y = headTop.y * CANVAS.height - 46;
  const text = QUESTION_PILL.textContent;

  CTX.font = "bold 18px Inter, Arial";
  const width = Math.min(CTX.measureText(text).width + 30, CANVAS.width * 0.82);
  const boxX = Math.max(14, Math.min(x - width / 2, CANVAS.width - width - 14));
  const boxY = Math.max(14, y);

  CTX.fillStyle = "rgba(255, 255, 255, 0.95)";
  CTX.strokeStyle = "rgba(30, 36, 46, 0.25)";
  CTX.lineWidth = 1.2;
  CTX.beginPath();
  CTX.roundRect(boxX, boxY, width, 34, 16);
  CTX.fill();
  CTX.stroke();

  CTX.fillStyle = "#121722";
  CTX.fillText(text, boxX + 12, boxY + 22);
}

function recordAnswer(selectedSide) {
  const q = QUESTIONS[currentQuestionIndex];
  const responseTimeMs = Math.round(performance.now() - questionStartedAt);
  const isFit = selectedSide === q.expectedSide;

  answers.push({
    questionId: q.id,
    questionText: q.text,
    expectedSide: q.expectedSide,
    selectedSide,
    isFit,
    responseTimeMs
  });

  currentQuestionIndex += 1;
  updateAmbience();
  requireNeutralReset = true;
  neutralResetFrames = 0;

  if (currentQuestionIndex >= QUESTIONS.length) {
    finishSession().catch((err) => {
      console.error("Erreur envoi session:", err);
    });
    return;
  }

  setQuestion();
}

function processDirection(direction, yaw) {
  const now = performance.now();
  if (now < lockUntil) return;

  if (requireNeutralReset) {
    if (direction === "neutral") {
      neutralResetFrames += 1;
      if (neutralResetFrames >= REQUIRED_NEUTRAL_FRAMES) {
        requireNeutralReset = false;
      }
    } else {
      neutralResetFrames = 0;
    }
    return;
  }

  if (now < questionReadyAt) {
    TILT_TEXT.textContent = "Stabilisez votre posture";
    return;
  }

  if (direction === "neutral") {
    stableFrames = 0;
    lastDirection = "neutral";
    candidateDirection = "neutral";
    directionHoldStart = 0;
    return;
  }

  if (Math.abs(yaw) < STRONG_YAW) {
    stableFrames = 0;
    candidateDirection = "neutral";
    directionHoldStart = 0;
    TILT_TEXT.textContent = "Inclinez un peu plus pour confirmer";
    return;
  }

  if (direction === lastDirection && direction === candidateDirection) {
    stableFrames += 1;
  } else {
    lastDirection = direction;
    candidateDirection = direction;
    directionHoldStart = now;
    stableFrames = 1;
  }

  const holdMs = now - directionHoldStart;
  if (stableFrames >= REQUIRED_STABLE_FRAMES && holdMs >= CONFIRM_HOLD_MS) {
    stableFrames = 0;
    candidateDirection = "neutral";
    directionHoldStart = 0;
    lockUntil = now + RESPONSE_COOLDOWN_MS;
    recordAnswer(direction);
  } else {
    const remaining = Math.max(0, CONFIRM_HOLD_MS - holdMs);
    TILT_TEXT.textContent = `Maintenez encore ${Math.ceil(remaining / 100)}s`;
  }
}

function loop() {
  if (!running) return;

  const result = faceLandmarker.detectForVideo(VIDEO, performance.now());
  const landmarks = result.faceLandmarks?.[0];
  const { direction, yaw } = landmarks ? detectHeadPose(landmarks) : { direction: "neutral", yaw: 0 };
  updateTiltIndicator(yaw, direction);
  processDirection(direction, yaw);
  drawQuestionOverHead(landmarks);

  requestAnimationFrame(loop);
}

async function initFaceLandmarker() {
  if (!FaceLandmarkerClass || !FilesetResolverClass) {
    const mediapipeModule = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14"
    );
    FaceLandmarkerClass = mediapipeModule.FaceLandmarker;
    FilesetResolverClass = mediapipeModule.FilesetResolver;
  }

  const vision = await FilesetResolverClass.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
  );

  faceLandmarker = await FaceLandmarkerClass.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
    },
    runningMode: "VIDEO",
    numFaces: 1
  });
}

async function openCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });
  VIDEO.srcObject = stream;
  await VIDEO.play();
  resizeCanvas();
}

async function finishSession() {
  running = false;
  EXPERIENCE_SCREEN.classList.add("hidden");
  RESULT_SCREEN.classList.remove("hidden");

  const score = answers.reduce((acc, answer) => acc + (answer.isFit ? 1 : 0), 0);
  const verdict = verdictFromScore(score);

  RESULT_VERDICT.textContent = `Verdict: ${verdict} (${score}/${QUESTIONS.length})`;
  RESULT_MESSAGE.textContent = messageFromVerdict(verdict);

  const payload = {
    sessionId,
    consentGiven: true,
    score,
    verdict,
    totalQuestions: QUESTIONS.length,
    positiveAnswers: score,
    answers,
    metadata: {
      userAgent: navigator.userAgent,
      language: navigator.language
    }
  };

  try {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error("Impossible d'enregistrer les données:", error);
  }
}

function resetState() {
  answers = [];
  currentQuestionIndex = 0;
  sessionId = crypto.randomUUID();
  stableFrames = 0;
  lastDirection = "neutral";
  lockUntil = 0;
  requireNeutralReset = false;
  neutralResetFrames = 0;
  candidateDirection = "neutral";
  directionHoldStart = 0;
  questionReadyAt = 0;
  updateAmbience();
  setQuestion();
  resetTiltIndicator();
}

async function startExperience() {
  CONSENT_SCREEN.classList.add("hidden");
  RESULT_SCREEN.classList.add("hidden");
  EXPERIENCE_SCREEN.classList.remove("hidden");

  if (!faceLandmarker) {
    await initFaceLandmarker();
  }

  await openCamera();
  resetState();
  running = true;
  loop();
}

function getReadableStartError(error) {
  const errorName = error?.name || "";
  const message = String(error?.message || "");

  if (errorName === "NotAllowedError") {
    return "Acces camera refuse. Autorise la camera dans le navigateur puis relance.";
  }
  if (errorName === "NotFoundError") {
    return "Aucune camera frontale detectee sur cet appareil.";
  }
  if (errorName === "NotReadableError") {
    return "La camera est deja utilisee par une autre application.";
  }
  if (
    message.toLowerCase().includes("wasm") ||
    message.toLowerCase().includes("webassembly") ||
    message.toLowerCase().includes("fetch")
  ) {
    return "Le module de detection n'a pas pu se charger. Recharge la page et reessaie.";
  }
  return "Impossible de demarrer la camera ou le modele IA.";
}

CONSENT_CHECKBOX.addEventListener("change", refreshConsentControls);
if (CONSENT_SCROLL) {
  CONSENT_SCROLL.addEventListener("scroll", handleConsentScroll);
}
initConsentGate();
// Improve touch/wheel UX: scrolling the card also scrolls the RGPD area.
CONSENT_SCREEN.addEventListener(
  "wheel",
  (event) => {
    if (!CONSENT_SCROLL || consentReadingCompleted) return;
    CONSENT_SCROLL.scrollTop += event.deltaY;
    handleConsentScroll();
  },
  { passive: true }
);

START_BUTTON.addEventListener("click", (event) => {
  event.preventDefault();
  if (!CONSENT_CHECKBOX.checked) {
    alert("Merci de cocher le consentement avant de continuer.");
    return;
  }
  startExperience().catch((error) => {
    alert(getReadableStartError(error));
    console.error(error);
    // Keep consent card hidden after click to avoid instant "flashback"
    // when camera/model init fails on some local environments.
    EXPERIENCE_SCREEN.classList.remove("hidden");
  });
});

RESTART_BUTTON.addEventListener("click", (event) => {
  event.preventDefault();
  startExperience().catch((error) => {
    alert(getReadableStartError(error));
    console.error(error);
    EXPERIENCE_SCREEN.classList.remove("hidden");
    RESULT_SCREEN.classList.add("hidden");
  });
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("resize", initConsentGate);
