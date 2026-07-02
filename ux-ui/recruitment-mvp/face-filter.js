import { getPersonTintStrength } from "./face-expression.js";

function mirrorPoint(landmark, width, height) {
  return { x: (1 - landmark.x) * width, y: landmark.y * height };
}

function pointAt(landmarks, index, width, height) {
  const lm = landmarks[index];
  return lm ? mirrorPoint(lm, width, height) : null;
}

function bboxFromIndices(landmarks, indices, width, height, padding = 0.12) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const index of indices) {
    const p = pointAt(landmarks, index, width, height);
    if (!p) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  if (!Number.isFinite(minX)) return null;

  const padX = (maxX - minX) * padding;
  const padY = (maxY - minY) * padding;
  return {
    x: Math.max(0, minX - padX),
    y: Math.max(0, minY - padY),
    w: Math.min(width, maxX + padX) - Math.max(0, minX - padX),
    h: Math.min(height, maxY + padY) - Math.max(0, minY - padY)
  };
}

function extractMirroredVideoRegion(video, sx, sy, sw, sh) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw));
  canvas.height = Math.max(1, Math.round(sh));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(video, -sx - sw, sy, sw, sh, 0, 0, sw, sh);
  ctx.restore();
  return canvas;
}

export function warpFrownRegion(sourceCanvas, sadness) {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d", { willReadFrequently: true });
  if (!srcCtx || !outCtx) return sourceCanvas;

  const src = srcCtx.getImageData(0, 0, w, h);
  const dst = outCtx.createImageData(w, h);
  const droop = 2 + sadness * 14;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = x / w - 0.5;
      const ny = y / h - 0.5;
      const edge = Math.pow(Math.abs(nx * 2), 1.35);
      const dispY = droop * edge * (ny > 0 ? 1.15 : 0.35);
      const srcY = Math.min(h - 1, Math.max(0, Math.round(y - dispY)));
      const srcIdx = (srcY * w + x) * 4;
      const dstIdx = (y * w + x) * 4;
      dst.data[dstIdx] = src.data[srcIdx];
      dst.data[dstIdx + 1] = src.data[srcIdx + 1];
      dst.data[dstIdx + 2] = src.data[srcIdx + 2];
      dst.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }

  outCtx.putImageData(dst, 0, 0);
  return out;
}

export function warpBrowRegion(sourceCanvas, sadness, side = "left") {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const srcCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d", { willReadFrequently: true });
  if (!srcCtx || !outCtx) return sourceCanvas;

  const src = srcCtx.getImageData(0, 0, w, h);
  const dst = outCtx.createImageData(w, h);
  const lift = 1.5 + sadness * 7;
  const direction = side === "left" ? -1 : 1;

  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = x / w;
      const innerWeight = side === "left" ? 1 - nx : nx;
      const dispY = -lift * Math.pow(innerWeight, 1.4);
      const srcY = Math.min(h - 1, Math.max(0, Math.round(y - dispY)));
      const srcX = Math.min(w - 1, Math.max(0, Math.round(x - direction * sadness * 1.2 * innerWeight)));
      const srcIdx = (srcY * w + srcX) * 4;
      const dstIdx = (y * w + x) * 4;
      dst.data[dstIdx] = src.data[srcIdx];
      dst.data[dstIdx + 1] = src.data[srcIdx + 1];
      dst.data[dstIdx + 2] = src.data[srcIdx + 2];
      dst.data[dstIdx + 3] = src.data[srcIdx + 3];
    }
  }

  outCtx.putImageData(dst, 0, 0);
  return out;
}

function drawTears(ctx, landmarks, width, height, sadness, timeMs) {
  if (sadness < 0.35) return;

  const leftEye = pointAt(landmarks, 33, width, height);
  const rightEye = pointAt(landmarks, 263, width, height);
  if (!leftEye || !rightEye) return;

  const tearAlpha = (sadness - 0.35) * 0.75;
  const offsets = [0, 0.35, 0.7];

  ctx.save();
  ctx.fillStyle = `rgba(150, 198, 255, ${tearAlpha})`;

  [leftEye, rightEye].forEach((eye, eyeIndex) => {
    offsets.forEach((offset, i) => {
      const y = eye.y + 10 + ((timeMs * 0.05 + i * 24 + eyeIndex * 11) % 42);
      const x = eye.x + (eyeIndex === 0 ? -4 : 4);
      ctx.beginPath();
      ctx.ellipse(x, y, 2.1, 3.8, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  });

  ctx.restore();
}

function applyMaskedPersonTint(ctx, personMaskCanvas, width, height, sadness) {
  const tint = getPersonTintStrength(sadness);
  if (tint.cool <= 0 && tint.dim <= 0) return;

  ctx.save();
  ctx.fillStyle = `rgba(72, 88, 118, ${tint.cool})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(personMaskCanvas, -width, 0, width, height);
  ctx.restore();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = `rgba(18, 24, 36, ${tint.dim})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "destination-in";
  ctx.save();
  ctx.scale(-1, 1);
  ctx.drawImage(personMaskCanvas, -width, 0, width, height);
  ctx.restore();
  ctx.restore();
}

const MOUTH_INDICES = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95];
const LEFT_BROW = [70, 63, 105, 66, 107];
const RIGHT_BROW = [300, 293, 334, 296, 336];

export function renderSadFaceFilter({
  filterCtx,
  video,
  landmarks,
  personMaskCanvas,
  width,
  height,
  sadness,
  timeMs
}) {
  filterCtx.clearRect(0, 0, width, height);
  if (!landmarks || sadness <= 0.02 || !video?.videoWidth) return;

  const mouthBox = bboxFromIndices(landmarks, MOUTH_INDICES, width, height, 0.28);
  const leftBrowBox = bboxFromIndices(landmarks, LEFT_BROW, width, height, 0.45);
  const rightBrowBox = bboxFromIndices(landmarks, RIGHT_BROW, width, height, 0.45);

  const regions = [
  mouthBox && {
    box: mouthBox,
    warp: (canvas) => warpFrownRegion(canvas, sadness)
  },
  leftBrowBox && {
    box: leftBrowBox,
    warp: (canvas) => warpBrowRegion(canvas, sadness, "left")
  },
  rightBrowBox && {
    box: rightBrowBox,
    warp: (canvas) => warpBrowRegion(canvas, sadness, "right")
  }
  ].filter(Boolean);

  for (const region of regions) {
    const { x, y, w, h } = region.box;
    const sx = width - x - w;
    const source = extractMirroredVideoRegion(video, sx, y, w, h);
    if (!source) continue;
    const warped = region.warp(source);
    filterCtx.drawImage(warped, x, y, w, h);
  }

  if (personMaskCanvas) {
    applyMaskedPersonTint(filterCtx, personMaskCanvas, width, height, sadness);
  }

  drawTears(filterCtx, landmarks, width, height, sadness, timeMs);

  if (sadness > 0.2) {
    const mouthLeft = pointAt(landmarks, 61, width, height);
    const mouthRight = pointAt(landmarks, 291, width, height);
    const mouthBottom = pointAt(landmarks, 17, width, height);
    if (mouthLeft && mouthRight && mouthBottom) {
      const alpha = (sadness - 0.2) * 0.22;
      filterCtx.save();
      filterCtx.fillStyle = `rgba(24, 32, 48, ${alpha})`;
      filterCtx.beginPath();
      filterCtx.ellipse(
        (mouthLeft.x + mouthRight.x) / 2,
        mouthBottom.y + sadness * 4,
        14 + sadness * 10,
        6 + sadness * 4,
        0,
        0,
        Math.PI
      );
      filterCtx.fill();
      filterCtx.restore();
    }
  }

  if (personMaskCanvas) {
    filterCtx.globalCompositeOperation = "destination-in";
    filterCtx.save();
    filterCtx.scale(-1, 1);
    filterCtx.drawImage(personMaskCanvas, -width, 0, width, height);
    filterCtx.restore();
    filterCtx.globalCompositeOperation = "source-over";
  }
}
