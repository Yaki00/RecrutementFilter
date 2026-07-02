import {
  applyMoodToScreen,
  countBadAnswers,
  getMoodStateFromAnswers
} from "./ambience-mood.js";
import {
  createMaskBuilder,
  renderMaskedBackground,
  resizeWeather
} from "./background-effects.js";
import {
  CONSENT_VERSION,
  getConsentUiState,
  isReadingCompleted,
  shouldRequireScroll
} from "./consent-gate.js";
import {
  getProfileUiState,
  validateProfileFields,
  getRegisterErrorMessage,
  isRegisterResponseValid,
  isProfileFormFullyComplete,
  canRegisterProfile
} from "./profile-form.js";
import {
  ONBOARDING_STEPS,
  getNextOnboardingStep,
  getOnboardingUiState,
  getPreviousOnboardingStep
} from "./onboarding.js";
import { getSadnessLevel } from "./face-expression.js";
import { renderSadFaceFilter } from "./face-filter.js";
import {
  getChoiceForSide,
  isFitAnswer,
  isScoredQuestion,
  loadQuestions
} from "./questions.js";
import {
  QUESTION_TIMEOUT_MS,
  computeSessionScore,
  isQuestionTimedOut,
  verdictFromScoredResult
} from "./question-timing.js";
import {
  HEAD_POSE_CONFIG,
  detectHeadPose,
  getTiltStrength,
  isConfirmReady,
  isConfirmYaw,
  isNeutralEnough
} from "./head-pose.js";

const CONSENT_SCREEN = document.querySelector("#consent-screen");
const PROFILE_SCREEN = document.querySelector("#profile-screen");
const ONBOARDING_SCREEN = document.querySelector("#onboarding-screen");
const ONBOARDING_PROGRESS = document.querySelector("#onboarding-progress");
const ONBOARDING_NEXT = document.querySelector("#onboarding-next");
const ONBOARDING_BACK = document.querySelector("#onboarding-back");
const ONBOARDING_CARDS = Array.from(document.querySelectorAll("[data-onboarding-step]"));
const ONBOARDING_DOTS = Array.from(document.querySelectorAll("[data-onboarding-dot]"));
const EXPERIENCE_SCREEN = document.querySelector("#experience-screen");
const RESULT_SCREEN = document.querySelector("#result-screen");
const CONSENT_CHECKBOX = document.querySelector("#consent-checkbox");
const CONSENT_SCROLL = document.querySelector("#consent-scroll");
const CONSENT_PROGRESS = document.querySelector("#consent-progress");
const START_BUTTON = document.querySelector("#start-btn");
const PROFILE_FORM = document.querySelector("#profile-form");
const PROFILE_FIRST_NAME = document.querySelector("#profile-first-name");
const PROFILE_LAST_NAME = document.querySelector("#profile-last-name");
const PROFILE_EMAIL = document.querySelector("#profile-email");
const PROFILE_SPECIALTY = document.querySelector("#profile-specialty");
const PROFILE_FIRST_NAME_ERROR = document.querySelector("#profile-first-name-error");
const PROFILE_LAST_NAME_ERROR = document.querySelector("#profile-last-name-error");
const PROFILE_EMAIL_ERROR = document.querySelector("#profile-email-error");
const PROFILE_SPECIALTY_ERROR = document.querySelector("#profile-specialty-error");
const PROFILE_FORM_ERROR = document.querySelector("#profile-form-error");
const PROFILE_SUBMIT = document.querySelector("#profile-submit");
const RESTART_BUTTON = document.querySelector("#restart-btn");
const QUESTION_PILL = document.querySelector("#question-pill");
const CHOICE_LEFT_LABEL = document.querySelector("#choice-left-label");
const CHOICE_RIGHT_LABEL = document.querySelector("#choice-right-label");
const HUD_LEFT_HINT = document.querySelector("#hud-left-hint");
const HUD_RIGHT_HINT = document.querySelector("#hud-right-hint");
const RESULT_VERDICT = document.querySelector("#result-verdict");
const RESULT_MESSAGE = document.querySelector("#result-message");
const TILT_LEFT_FILL = document.querySelector("#tilt-left-fill");
const TILT_RIGHT_FILL = document.querySelector("#tilt-right-fill");
const TILT_TEXT = document.querySelector("#tilt-text");
const VIDEO = document.querySelector("#camera");
const EFFECTS_CANVAS = document.querySelector("#bg-effects");
const FACE_FILTER_CANVAS = document.querySelector("#face-filter");
const CANVAS = document.querySelector("#overlay");
const EFFECTS_CTX = EFFECTS_CANVAS.getContext("2d");
const FACE_FILTER_CTX = FACE_FILTER_CANVAS.getContext("2d");
const CTX = CANVAS.getContext("2d");

let faceLandmarker;
let imageSegmenter;
let running = false;
let questions = [];
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
let ImageSegmenterClass;
let maskBuilder;
let currentMoodState = { mood: "calm", intensity: 0 };
let currentSadness = 0;
let questionAnswered = false;
let questionTimeoutId = null;

let consentReadingCompleted = false;
let consentRecord = null;
let candidateId = null;
let candidateToken = null;
let candidateProfile = null;
let profileSubmitting = false;
let profileSubmitAttempted = false;
let onboardingStepIndex = 0;
const profileTouched = {
  firstName: false,
  lastName: false,
  email: false,
  specialty: false
};

function resetProfileTouchState() {
  profileSubmitAttempted = false;
  profileTouched.firstName = false;
  profileTouched.lastName = false;
  profileTouched.email = false;
  profileTouched.specialty = false;
}

function markProfileFieldTouched(fieldName) {
  profileTouched[fieldName] = true;
  refreshProfileForm();
}

function getProfileFormOptions() {
  return {
    touched: profileTouched,
    submitAttempted: profileSubmitAttempted
  };
}

function getProfileFieldValues() {
  return {
    firstName: PROFILE_FIRST_NAME?.value || "",
    lastName: PROFILE_LAST_NAME?.value || "",
    email: PROFILE_EMAIL?.value || "",
    specialty: PROFILE_SPECIALTY?.value || ""
  };
}

function setProfileFieldError(input, errorNode, message) {
  if (!input || !errorNode) return;
  input.setAttribute("aria-invalid", message ? "true" : "false");
  errorNode.textContent = message || "";
}

function setProfileFormError(message) {
  if (!PROFILE_FORM_ERROR) return;
  if (message) {
    PROFILE_FORM_ERROR.textContent = message;
    PROFILE_FORM_ERROR.classList.remove("hidden");
  } else {
    PROFILE_FORM_ERROR.textContent = "";
    PROFILE_FORM_ERROR.classList.add("hidden");
  }
}

function refreshProfileForm() {
  const uiState = getProfileUiState(getProfileFieldValues(), getProfileFormOptions());
  setProfileFieldError(
    PROFILE_FIRST_NAME,
    PROFILE_FIRST_NAME_ERROR,
    uiState.visibleErrors.firstName
  );
  setProfileFieldError(
    PROFILE_LAST_NAME,
    PROFILE_LAST_NAME_ERROR,
    uiState.visibleErrors.lastName
  );
  setProfileFieldError(PROFILE_EMAIL, PROFILE_EMAIL_ERROR, uiState.visibleErrors.email);
  setProfileFieldError(
    PROFILE_SPECIALTY,
    PROFILE_SPECIALTY_ERROR,
    uiState.visibleErrors.specialty
  );

  if (PROFILE_SUBMIT) {
    PROFILE_SUBMIT.disabled = uiState.submitDisabled || profileSubmitting;
  }
}

function showProfileScreen() {
  CONSENT_SCREEN.classList.add("hidden");
  ONBOARDING_SCREEN.classList.add("hidden");
  RESULT_SCREEN.classList.add("hidden");
  EXPERIENCE_SCREEN.classList.add("hidden");
  PROFILE_SCREEN.classList.remove("hidden");
  resetProfileTouchState();
  setProfileFormError("");
  refreshProfileForm();
  PROFILE_FIRST_NAME?.focus();
}

function renderOnboardingStep() {
  const uiState = getOnboardingUiState(onboardingStepIndex, ONBOARDING_STEPS.length);

  ONBOARDING_CARDS.forEach((card, index) => {
    card.classList.toggle("hidden", index !== uiState.stepIndex);
  });

  ONBOARDING_DOTS.forEach((dot, index) => {
    dot.classList.toggle("active", index === uiState.stepIndex);
  });

  if (ONBOARDING_PROGRESS) {
    ONBOARDING_PROGRESS.textContent = uiState.progressLabel;
  }

  if (ONBOARDING_NEXT) {
    ONBOARDING_NEXT.textContent = uiState.nextLabel;
  }

  if (ONBOARDING_BACK) {
    ONBOARDING_BACK.classList.toggle("hidden", !uiState.showBackButton);
  }
}

function showOnboardingScreen() {
  onboardingStepIndex = 0;
  CONSENT_SCREEN.classList.add("hidden");
  PROFILE_SCREEN.classList.add("hidden");
  RESULT_SCREEN.classList.add("hidden");
  EXPERIENCE_SCREEN.classList.add("hidden");
  ONBOARDING_SCREEN.classList.remove("hidden");
  renderOnboardingStep();
}

function handleOnboardingBack() {
  if (onboardingStepIndex <= 0) {
    PROFILE_SCREEN.classList.remove("hidden");
    ONBOARDING_SCREEN.classList.add("hidden");
    return;
  }

  onboardingStepIndex = getPreviousOnboardingStep(onboardingStepIndex);
  renderOnboardingStep();
}

function handleOnboardingNext() {
  const uiState = getOnboardingUiState(onboardingStepIndex, ONBOARDING_STEPS.length);

  if (uiState.isLastStep) {
    startExperience().catch((error) => {
      alert(getReadableStartError(error));
      console.error(error);
      ONBOARDING_SCREEN.classList.add("hidden");
      EXPERIENCE_SCREEN.classList.remove("hidden");
    });
    return;
  }

  onboardingStepIndex = getNextOnboardingStep(onboardingStepIndex, ONBOARDING_STEPS.length);
  renderOnboardingStep();
}

function resetProfileForm() {
  candidateId = null;
  candidateToken = null;
  candidateProfile = null;
  profileSubmitting = false;
  resetProfileTouchState();
  if (PROFILE_FORM) {
    PROFILE_FORM.reset();
  }
  setProfileFormError("");
  refreshProfileForm();
}

function markAllProfileFieldsTouched() {
  profileTouched.firstName = true;
  profileTouched.lastName = true;
  profileTouched.email = true;
  profileTouched.specialty = true;
}

async function registerCandidate({ explicitSubmit = false } = {}) {
  if (!explicitSubmit) {
    return false;
  }

  profileSubmitAttempted = true;
  markAllProfileFieldsTouched();

  const registration = canRegisterProfile(getProfileFieldValues(), { explicitSubmit: true });

  if (!registration.allowed) {
    refreshProfileForm();
    return false;
  }

  const { normalized } = registration.validation;

  profileSubmitting = true;
  refreshProfileForm();
  setProfileFormError("");

  try {
    const response = await fetch("/api/candidates/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...normalized,
        consent: consentRecord
      })
    });
    const data = await response.json().catch(() => ({}));

    if (!isRegisterResponseValid(response, data)) {
      if (response.status === 409) {
        profileTouched.email = true;
        refreshProfileForm();
      } else if (data.fieldErrors) {
        profileSubmitAttempted = true;
        if (data.fieldErrors.firstName) profileTouched.firstName = true;
        if (data.fieldErrors.lastName) profileTouched.lastName = true;
        if (data.fieldErrors.email) profileTouched.email = true;
        if (data.fieldErrors.specialty) profileTouched.specialty = true;
        refreshProfileForm();
      }

      setProfileFormError(getRegisterErrorMessage(response.status, data));
      if (response.status === 409) {
        PROFILE_EMAIL?.focus();
      }
      return false;
    }

    candidateId = data.candidateId;
    candidateToken = data.candidateToken;
    candidateProfile = data.profile;
    return true;
  } catch (error) {
    console.error("Impossible d'enregistrer le profil:", error);
    setProfileFormError("Connexion impossible. Vérifiez votre réseau puis réessayez.");
    return false;
  } finally {
    profileSubmitting = false;
    refreshProfileForm();
  }
}

function resetConsentState() {
  consentReadingCompleted = false;
  consentRecord = null;
  if (CONSENT_CHECKBOX) {
    CONSENT_CHECKBOX.checked = false;
  }
  if (CONSENT_SCROLL) {
    CONSENT_SCROLL.scrollTop = 0;
  }
  initConsentGate();
  refreshConsentControls();
}

function captureConsentRecord() {
  consentRecord = {
    given: true,
    at: new Date().toISOString(),
    version: CONSENT_VERSION
  };
  return consentRecord;
}

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

function verdictFromScore(score, scoredTotal) {
  return verdictFromScoredResult(score, scoredTotal);
}

function clearQuestionTimeout() {
  if (questionTimeoutId) {
    clearTimeout(questionTimeoutId);
    questionTimeoutId = null;
  }
}

function scheduleQuestionTimeout() {
  clearQuestionTimeout();
  const q = questions[currentQuestionIndex];
  if (!q) return;

  questionTimeoutId = setTimeout(() => {
    recordTimeoutAnswer();
  }, QUESTION_TIMEOUT_MS);
}

function advanceAfterAnswer() {
  currentQuestionIndex += 1;
  updateAmbience();
  requireNeutralReset = true;
  neutralResetFrames = 0;

  if (currentQuestionIndex >= questions.length) {
    finishSession().catch((err) => {
      console.error("Erreur envoi session:", err);
    });
    return;
  }

  setQuestion();
}

function buildAnswerRecord(q, { selectedSide, selectedChoice, responseTimeMs, timedOut }) {
  const expectedChoice = getChoiceForSide(q, q.fitSide);
  const isFit = timedOut && !isScoredQuestion(q)
    ? true
    : isFitAnswer(q, selectedSide);

  return {
    questionId: q.id,
    questionText: q.text,
    questionType: q.type,
    scored: isScoredQuestion(q),
    leftLabel: q.left.label,
    rightLabel: q.right.label,
    expectedSide: q.scored === false ? null : q.fitSide,
    expectedLabel: q.scored === false ? null : expectedChoice.label,
    selectedSide,
    selectedLabel: selectedChoice?.label || (timedOut ? "Temps écoulé" : null),
    selectedValue: selectedChoice?.value || (timedOut ? "timeout" : null),
    isFit,
    timedOut: Boolean(timedOut),
    responseTimeMs
  };
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
  currentMoodState = getMoodStateFromAnswers(answers);
  currentSadness = getSadnessLevel(countBadAnswers(answers));
  applyMoodToScreen(EXPERIENCE_SCREEN, currentMoodState);

  if (currentMoodState.mood === "calm") {
    TILT_TEXT.style.color = "#eff4ff";
    TILT_TEXT.style.textShadow = "0 1px 5px rgba(0, 0, 0, 0.4)";
  } else if (currentMoodState.mood === "gradient") {
    TILT_TEXT.style.color = "#d9e4ff";
    TILT_TEXT.style.textShadow = `0 2px ${6 + currentMoodState.intensity * 4}px rgba(0, 0, 0, ${0.55 + currentMoodState.intensity * 0.18})`;
  } else {
    TILT_TEXT.style.color = "#cad8ff";
    TILT_TEXT.style.textShadow = "0 2px 10px rgba(0, 0, 0, 0.82)";
  }
}

function setQuestion() {
  clearQuestionTimeout();
  questionAnswered = false;

  const q = questions[currentQuestionIndex];
  QUESTION_PILL.textContent = q ? q.text : "Calcul du résultat...";

  if (q) {
    CHOICE_LEFT_LABEL.textContent = q.left.label;
    CHOICE_RIGHT_LABEL.textContent = q.right.label;
    HUD_LEFT_HINT.textContent = `Gauche : ${q.left.label}`;
    HUD_RIGHT_HINT.textContent = `Droite : ${q.right.label}`;
    scheduleQuestionTimeout();
  } else {
    CHOICE_LEFT_LABEL.textContent = "—";
    CHOICE_RIGHT_LABEL.textContent = "—";
    HUD_LEFT_HINT.textContent = "Inclinez à gauche";
    HUD_RIGHT_HINT.textContent = "Inclinez à droite";
  }

  questionStartedAt = performance.now();
  questionReadyAt = questionStartedAt + HEAD_POSE_CONFIG.minReactionMs;
  candidateDirection = "neutral";
  directionHoldStart = 0;
  stableFrames = 0;
}

function resizeCanvas() {
  const width = VIDEO.videoWidth || EXPERIENCE_SCREEN.clientWidth;
  const height = VIDEO.videoHeight || EXPERIENCE_SCREEN.clientHeight;
  CANVAS.width = width;
  CANVAS.height = height;
  EFFECTS_CANVAS.width = width;
  EFFECTS_CANVAS.height = height;
  FACE_FILTER_CANVAS.width = width;
  FACE_FILTER_CANVAS.height = height;
  resizeWeather(width, height);
}

function renderVisualEffects(confidenceMask, landmarks, timestamp) {
  const width = EFFECTS_CANVAS.width;
  const height = EFFECTS_CANVAS.height;

  if (!confidenceMask || !EFFECTS_CTX || !FACE_FILTER_CTX) {
    EFFECTS_CTX?.clearRect(0, 0, width, height);
    FACE_FILTER_CTX?.clearRect(0, 0, width, height);
    return;
  }

  if (!maskBuilder) {
    maskBuilder = createMaskBuilder();
  }

  const personMaskCanvas = maskBuilder.build(confidenceMask, width, height);

  renderMaskedBackground({
    effectsCtx: EFFECTS_CTX,
    maskBuilder,
    personMaskCanvas,
    width,
    height,
    moodState: currentMoodState
  });

  renderSadFaceFilter({
    filterCtx: FACE_FILTER_CTX,
    video: VIDEO,
    landmarks,
    personMaskCanvas,
    width,
    height,
    sadness: currentSadness,
    timeMs: timestamp
  });
}

function detectHeadPoseFromLandmarks(landmarks) {
  return detectHeadPose(landmarks, lastDirection, HEAD_POSE_CONFIG);
}

function resetTiltIndicator(text = "Inclinez legerement la tete pour valider") {
  TILT_LEFT_FILL.style.width = "0%";
  TILT_RIGHT_FILL.style.width = "0%";
  TILT_TEXT.textContent = text;
}

function updateTiltIndicator(yaw, direction) {
  const strength = getTiltStrength(yaw, HEAD_POSE_CONFIG);
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

function drawOverlay(landmarks) {
  CTX.clearRect(0, 0, CANVAS.width, CANVAS.height);
  if (!landmarks) return;

  const headTop = landmarks[10];
  if (!headTop) return;

  const x = (1 - headTop.x) * CANVAS.width;
  const y = headTop.y * CANVAS.height - 46;
  const text = QUESTION_PILL.textContent;

  CTX.font = window.matchMedia("(max-width: 780px)").matches
    ? "bold 15px Inter, Arial, sans-serif"
    : "bold 18px Inter, Arial, sans-serif";
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

function recordTimeoutAnswer() {
  if (questionAnswered) return;

  const q = questions[currentQuestionIndex];
  if (!q) return;

  questionAnswered = true;
  clearQuestionTimeout();
  lockUntil = performance.now() + HEAD_POSE_CONFIG.responseCooldownMs;

  answers.push(
    buildAnswerRecord(q, {
      selectedSide: null,
      selectedChoice: null,
      responseTimeMs: QUESTION_TIMEOUT_MS,
      timedOut: true
    })
  );

  resetTiltIndicator("Temps ecoule — question suivante");
  advanceAfterAnswer();
}

function recordAnswer(selectedSide) {
  if (questionAnswered) return;

  const q = questions[currentQuestionIndex];
  if (!q) return;

  questionAnswered = true;
  clearQuestionTimeout();

  const responseTimeMs = Math.round(performance.now() - questionStartedAt);
  const selectedChoice = getChoiceForSide(q, selectedSide);

  answers.push(
    buildAnswerRecord(q, {
      selectedSide,
      selectedChoice,
      responseTimeMs,
      timedOut: false
    })
  );

  advanceAfterAnswer();
}

function processDirection(direction, yaw) {
  const now = performance.now();
  if (now < lockUntil) return;

  if (requireNeutralReset) {
    if (isNeutralEnough(direction, yaw, HEAD_POSE_CONFIG)) {
      neutralResetFrames += 1;
      if (neutralResetFrames >= HEAD_POSE_CONFIG.requiredNeutralFrames) {
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

  if (
    !questionAnswered &&
    !requireNeutralReset &&
    isQuestionTimedOut(now - questionStartedAt)
  ) {
    recordTimeoutAnswer();
    return;
  }

  if (direction === "neutral") {
    stableFrames = 0;
    lastDirection = "neutral";
    candidateDirection = "neutral";
    directionHoldStart = 0;
    return;
  }

  if (!isConfirmYaw(yaw, HEAD_POSE_CONFIG)) {
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
  if (isConfirmReady(stableFrames, holdMs, HEAD_POSE_CONFIG)) {
    stableFrames = 0;
    candidateDirection = "neutral";
    directionHoldStart = 0;
    lockUntil = now + HEAD_POSE_CONFIG.responseCooldownMs;
    recordAnswer(direction);
  } else {
    const remaining = Math.max(0, HEAD_POSE_CONFIG.confirmHoldMs - holdMs);
    TILT_TEXT.textContent = `Maintenez encore ${Math.ceil(remaining / 100)}s`;
  }
}

function loop() {
  if (!running) return;

  const timestamp = performance.now();
  const result = faceLandmarker.detectForVideo(VIDEO, timestamp);
  const landmarks = result.faceLandmarks?.[0];
  const { direction, yaw } = landmarks
    ? detectHeadPoseFromLandmarks(landmarks)
    : { direction: "neutral", yaw: 0 };

  if (imageSegmenter) {
    const segmentation = imageSegmenter.segmentForVideo(VIDEO, timestamp);
    renderVisualEffects(segmentation.confidenceMasks?.[0], landmarks, timestamp);
  } else {
    renderVisualEffects(null, landmarks, timestamp);
  }

  updateTiltIndicator(yaw, direction);
  processDirection(direction, yaw);
  drawOverlay(landmarks);

  requestAnimationFrame(loop);
}

async function initMediaModels() {
  if (!FaceLandmarkerClass || !FilesetResolverClass || !ImageSegmenterClass) {
    const mediapipeModule = await import(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14"
    );
    FaceLandmarkerClass = mediapipeModule.FaceLandmarker;
    FilesetResolverClass = mediapipeModule.FilesetResolver;
    ImageSegmenterClass = mediapipeModule.ImageSegmenter;
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

  imageSegmenter = await ImageSegmenterClass.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite"
    },
    runningMode: "VIDEO",
    outputCategoryMask: false,
    outputConfidenceMasks: true
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
  clearQuestionTimeout();
  EXPERIENCE_SCREEN.classList.add("hidden");
  RESULT_SCREEN.classList.remove("hidden");

  const { score: clientScore, scoredTotal: clientScoredTotal } = computeSessionScore(
    questions,
    answers
  );
  const clientVerdict = verdictFromScore(clientScore, clientScoredTotal);

  RESULT_VERDICT.textContent = `Verdict: ${clientVerdict} (${clientScore}/${clientScoredTotal})`;
  RESULT_MESSAGE.textContent = messageFromVerdict(clientVerdict);

  const payload = {
    sessionId,
    candidateId,
    candidateToken,
    consent: consentRecord,
    answers,
    metadata: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      candidate: candidateProfile
    }
  };

  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok && data.ok) {
      RESULT_VERDICT.textContent = `Verdict: ${data.verdict} (${data.score}/${data.scoredTotal})`;
      RESULT_MESSAGE.textContent = messageFromVerdict(data.verdict);
    } else {
      console.error("Enregistrement session refusé:", data.error || response.status);
      RESULT_MESSAGE.textContent =
        "Votre participation n'a pas pu être enregistrée. Contactez l'équipe recrutement.";
    }
  } catch (error) {
    console.error("Impossible d'enregistrer les données:", error);
    RESULT_MESSAGE.textContent =
      "Votre participation n'a pas pu être enregistrée. Vérifiez votre connexion.";
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
  questionAnswered = false;
  clearQuestionTimeout();
  updateAmbience();
  setQuestion();
  resetTiltIndicator();
}

async function startExperience() {
  if (!candidateId || !candidateToken) {
    showProfileScreen();
    return;
  }

  ONBOARDING_SCREEN.classList.add("hidden");
  PROFILE_SCREEN.classList.add("hidden");
  CONSENT_SCREEN.classList.add("hidden");
  RESULT_SCREEN.classList.add("hidden");
  EXPERIENCE_SCREEN.classList.remove("hidden");

  try {
    questions = await loadQuestions();
  } catch (error) {
    alert("Impossible de charger les questions. Verifie questions.json puis relance.");
    console.error(error);
    showOnboardingScreen();
    return;
  }

  if (!faceLandmarker || !imageSegmenter) {
    await initMediaModels();
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
  captureConsentRecord();
  showProfileScreen();
});

PROFILE_FORM?.addEventListener("input", refreshProfileForm);

PROFILE_FIRST_NAME?.addEventListener("blur", () => markProfileFieldTouched("firstName"));
PROFILE_LAST_NAME?.addEventListener("blur", () => markProfileFieldTouched("lastName"));
PROFILE_EMAIL?.addEventListener("blur", () => markProfileFieldTouched("email"));
PROFILE_SPECIALTY?.addEventListener("blur", () => markProfileFieldTouched("specialty"));
PROFILE_SPECIALTY?.addEventListener("change", () => markProfileFieldTouched("specialty"));

PROFILE_FORM?.addEventListener("submit", (event) => {
  event.preventDefault();
  registerCandidate({ explicitSubmit: true })
    .then((registered) => {
      if (!registered) return;
      showOnboardingScreen();
    })
    .catch((error) => {
      console.error(error);
      setProfileFormError("Une erreur est survenue. Réessayez.");
    });
});

PROFILE_FORM?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.target?.tagName === "TEXTAREA") return;
  if (!isProfileFormFullyComplete(getProfileFieldValues())) {
    event.preventDefault();
  }
});

ONBOARDING_NEXT?.addEventListener("click", (event) => {
  event.preventDefault();
  handleOnboardingNext();
});

ONBOARDING_BACK?.addEventListener("click", (event) => {
  event.preventDefault();
  handleOnboardingBack();
});

RESTART_BUTTON.addEventListener("click", (event) => {
  event.preventDefault();
  running = false;
  onboardingStepIndex = 0;
  resetProfileForm();
  resetConsentState();
  EXPERIENCE_SCREEN.classList.add("hidden");
  RESULT_SCREEN.classList.add("hidden");
  ONBOARDING_SCREEN.classList.add("hidden");
  PROFILE_SCREEN.classList.add("hidden");
  CONSENT_SCREEN.classList.remove("hidden");
});

window.addEventListener("resize", resizeCanvas);
window.addEventListener("resize", initConsentGate);
