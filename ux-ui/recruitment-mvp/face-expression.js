export function getSadnessLevel(badAnswers) {
  const bad = Math.max(0, Number(badAnswers) || 0);
  if (bad === 0) return 0;
  return Math.min(1, bad / 7);
}

export function getPersonTintStrength(sadness) {
  const level = Math.max(0, Math.min(1, sadness));
  return {
    cool: level * 0.2,
    dim: level * 0.14
  };
}

function toCanvasPoint(landmark, width, height) {
  return {
    x: (1 - landmark.x) * width,
    y: landmark.y * height
  };
}

function pointAt(landmarks, index, width, height) {
  const landmark = landmarks[index];
  if (!landmark) return null;
  return toCanvasPoint(landmark, width, height);
}

export function drawSadExpression(ctx, landmarks, width, height, sadness) {
  if (!landmarks || sadness <= 0.02) return;

  const mouthLeft = pointAt(landmarks, 61, width, height);
  const mouthRight = pointAt(landmarks, 291, width, height);
  const mouthBottom = pointAt(landmarks, 17, width, height);
  const browLeftInner = pointAt(landmarks, 107, width, height);
  const browRightInner = pointAt(landmarks, 336, width, height);
  const browLeftOuter = pointAt(landmarks, 70, width, height);
  const browRightOuter = pointAt(landmarks, 300, width, height);
  const eyeLeftBottom = pointAt(landmarks, 145, width, height);
  const eyeRightBottom = pointAt(landmarks, 374, width, height);

  if (
    !mouthLeft ||
    !mouthRight ||
    !mouthBottom ||
    !browLeftInner ||
    !browRightInner ||
    !browLeftOuter ||
    !browRightOuter
  ) {
    return;
  }

  const lineAlpha = 0.12 + sadness * 0.42;
  const lineWidth = 1 + sadness * 1.8;
  const droop = 3 + sadness * 11;
  const browLift = 2 + sadness * 9;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = `rgba(36, 46, 66, ${lineAlpha})`;
  ctx.lineWidth = lineWidth;

  ctx.beginPath();
  ctx.moveTo(mouthLeft.x, mouthLeft.y);
  ctx.quadraticCurveTo(mouthLeft.x - 3, mouthLeft.y + droop * 0.45, mouthLeft.x + 4, mouthLeft.y + droop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(mouthRight.x, mouthRight.y);
  ctx.quadraticCurveTo(mouthRight.x + 3, mouthRight.y + droop * 0.45, mouthRight.x - 4, mouthRight.y + droop);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(browLeftOuter.x, browLeftOuter.y + 1);
  ctx.quadraticCurveTo(
    (browLeftOuter.x + browLeftInner.x) / 2,
    browLeftInner.y - browLift,
    browLeftInner.x,
    browLeftInner.y - browLift * 0.35
  );
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(browRightOuter.x, browRightOuter.y + 1);
  ctx.quadraticCurveTo(
    (browRightOuter.x + browRightInner.x) / 2,
    browRightInner.y - browLift,
    browRightInner.x,
    browRightInner.y - browLift * 0.35
  );
  ctx.stroke();

  if (sadness > 0.2 && eyeLeftBottom && eyeRightBottom) {
    const shadowAlpha = (sadness - 0.2) * 0.32;
    ctx.fillStyle = `rgba(24, 32, 48, ${shadowAlpha})`;
    [eyeLeftBottom, eyeRightBottom].forEach((eye) => {
      ctx.beginPath();
      ctx.ellipse(eye.x, eye.y + 3, 9 + sadness * 7, 3.5 + sadness * 2.2, 0, 0, Math.PI);
      ctx.fill();
    });
  }

  if (sadness > 0.12) {
    ctx.fillStyle = `rgba(30, 38, 56, ${(sadness - 0.12) * 0.28})`;
    ctx.beginPath();
    ctx.ellipse(
      (mouthLeft.x + mouthRight.x) / 2,
      mouthBottom.y + droop * 0.2,
      12 + sadness * 9,
      5 + sadness * 3,
      0,
      0,
      Math.PI
    );
    ctx.fill();
  }

  ctx.restore();
}
