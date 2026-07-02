export const HEAD_POSE_CONFIG = {
  yawEnterThreshold: 0.068,
  yawExitThreshold: 0.042,
  confirmYaw: 0.102,
  requiredStableFrames: 11,
  confirmHoldMs: 460,
  requiredNeutralFrames: 4,
  minReactionMs: 420,
  responseCooldownMs: 850,
  neutralYawMax: 0.045,
  indicatorYaw: 0.102
};

export function computeYaw(landmarks) {
  const leftEye = landmarks[33];
  const rightEye = landmarks[263];
  const nose = landmarks[1];

  if (!leftEye || !rightEye || !nose) {
    return 0;
  }

  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const eyeDist = Math.abs(rightEye.x - leftEye.x) || 1;
  return (nose.x - eyeMidX) / eyeDist;
}

export function detectHeadPose(
  landmarks,
  lastDirection = "neutral",
  config = HEAD_POSE_CONFIG
) {
  if (!landmarks) {
    return { direction: "neutral", yaw: 0 };
  }

  const yaw = computeYaw(landmarks);
  const { yawEnterThreshold, yawExitThreshold } = config;

  if (lastDirection === "right" && yaw > yawExitThreshold) {
    return { direction: "right", yaw };
  }
  if (lastDirection === "left" && yaw < -yawExitThreshold) {
    return { direction: "left", yaw };
  }

  if (yaw > yawEnterThreshold) {
    return { direction: "right", yaw };
  }
  if (yaw < -yawEnterThreshold) {
    return { direction: "left", yaw };
  }

  return { direction: "neutral", yaw };
}

export function isConfirmYaw(yaw, config = HEAD_POSE_CONFIG) {
  return Math.abs(yaw) >= config.confirmYaw;
}

export function isNeutralEnough(direction, yaw, config = HEAD_POSE_CONFIG) {
  return direction === "neutral" || Math.abs(yaw) <= config.neutralYawMax;
}

export function isConfirmReady(stableFrames, holdMs, config = HEAD_POSE_CONFIG) {
  return stableFrames >= config.requiredStableFrames && holdMs >= config.confirmHoldMs;
}

export function getTiltStrength(yaw, config = HEAD_POSE_CONFIG) {
  return Math.min(1, Math.abs(yaw) / config.indicatorYaw);
}
