import { fillPersonMaskImageData } from "./person-mask.js";
import { getPersonTintStrength } from "./face-expression.js";

export function getBackgroundOverlayStrength(moodState) {
  if (!moodState || moodState.mood === "calm") {
    return { edge: 0.08, fill: 0 };
  }

  if (moodState.mood === "gradient") {
    return {
      edge: 0.18 + moodState.intensity * 0.42,
      fill: 0.08 + moodState.intensity * 0.24
    };
  }

  return { edge: 0.92, fill: 0.58 };
}

export function drawMoodOverlay(ctx, width, height, moodState) {
  const strength = getBackgroundOverlayStrength(moodState);
  const centerX = width * 0.5;
  const centerY = height * 0.44;
  const radius = Math.max(width, height) * 0.78;

  ctx.clearRect(0, 0, width, height);

  if (strength.fill > 0) {
    ctx.fillStyle = `rgba(2, 4, 10, ${strength.fill})`;
    ctx.fillRect(0, 0, width, height);
  }

  const gradient = ctx.createRadialGradient(centerX, centerY, height * 0.12, centerX, centerY, radius);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
  gradient.addColorStop(0.62, `rgba(0, 0, 0, ${strength.edge * 0.45})`);
  gradient.addColorStop(1, `rgba(0, 0, 0, ${strength.edge})`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

export function drawMirroredMask(ctx, maskCanvas, width, height) {
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(maskCanvas, -width, 0, width, height);
  ctx.restore();
}

export function applyPersonTint(ctx, maskCanvas, width, height, sadness) {
  const tint = getPersonTintStrength(sadness);
  if (tint.cool <= 0 && tint.dim <= 0) return;

  ctx.save();
  ctx.fillStyle = `rgba(62, 74, 98, ${tint.cool})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "destination-in";
  drawMirroredMask(ctx, maskCanvas, width, height);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = `rgba(20, 26, 38, ${tint.dim})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "destination-in";
  drawMirroredMask(ctx, maskCanvas, width, height);
  ctx.restore();
}

export function renderMaskedBackground({
  effectsCtx,
  maskBuilder,
  confidenceMask,
  width,
  height,
  moodState,
  sadness = 0
}) {
  drawMoodOverlay(effectsCtx, width, height, moodState);

  const personMaskCanvas = maskBuilder.build(confidenceMask, width, height);
  if (!personMaskCanvas) return null;

  effectsCtx.globalCompositeOperation = "destination-out";
  drawMirroredMask(effectsCtx, personMaskCanvas, width, height);
  effectsCtx.globalCompositeOperation = "source-over";

  applyPersonTint(effectsCtx, personMaskCanvas, width, height, sadness);
  return personMaskCanvas;
}

export function createMaskBuilder() {
  const sourceCanvas = document.createElement("canvas");
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const outputCanvas = document.createElement("canvas");

  return {
    build(confidenceMask, targetWidth, targetHeight) {
      if (!confidenceMask || !sourceCtx) return null;

      const maskWidth = confidenceMask.width;
      const maskHeight = confidenceMask.height;
      const maskValues = confidenceMask.getAsFloat32Array();

      sourceCanvas.width = maskWidth;
      sourceCanvas.height = maskHeight;

      const imageData = sourceCtx.createImageData(maskWidth, maskHeight);
      fillPersonMaskImageData(imageData, maskValues);
      sourceCtx.putImageData(imageData, 0, 0);

      outputCanvas.width = targetWidth;
      outputCanvas.height = targetHeight;
      const outputCtx = outputCanvas.getContext("2d");
      if (!outputCtx) return null;

      outputCtx.clearRect(0, 0, targetWidth, targetHeight);
      outputCtx.imageSmoothingEnabled = true;
      outputCtx.filter = "blur(3px)";
      outputCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
      outputCtx.filter = "none";

      if (typeof confidenceMask.close === "function") {
        confidenceMask.close();
      }

      return outputCanvas;
    }
  };
}
