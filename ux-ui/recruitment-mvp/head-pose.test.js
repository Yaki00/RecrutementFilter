import { describe, expect, it } from "vitest";
import {
  HEAD_POSE_CONFIG,
  detectHeadPose,
  getTiltStrength,
  isConfirmReady,
  isConfirmYaw,
  isNeutralEnough
} from "./head-pose.js";

const baseLandmarks = Array.from({ length: 500 }, () => ({ x: 0.5, y: 0.5, z: 0 }));

function withYaw(yawLike) {
  const landmarks = baseLandmarks.map((point) => ({ ...point }));
  landmarks[33] = { x: 0.4, y: 0.5, z: 0 };
  landmarks[263] = { x: 0.6, y: 0.5, z: 0 };
  landmarks[1] = { x: 0.5 + yawLike * 0.2, y: 0.52, z: 0 };
  return landmarks;
}

describe("head-pose", () => {
  it("detecte une inclinaison legere vers la droite", () => {
    const result = detectHeadPose(withYaw(0.5));
    expect(result.direction).toBe("right");
  });

  it("reste neutre sur un micro-mouvement", () => {
    const result = detectHeadPose(withYaw(0.05));
    expect(result.direction).toBe("neutral");
  });

  it("utilise une hysteresis pour eviter les flickers", () => {
    const withMemory = detectHeadPose(withYaw(0.05), "right");
    const withoutMemory = detectHeadPose(withYaw(0.05), "neutral");

    expect(withMemory.direction).toBe("right");
    expect(withoutMemory.direction).toBe("neutral");
  });

  it("valide une confirmation avec un yaw plus leger qu avant", () => {
    const landmarks = withYaw(0.55);
    const { yaw } = detectHeadPose(landmarks);
    expect(isConfirmYaw(yaw)).toBe(true);
  });

  it("exige un maintien suffisant avant validation", () => {
    expect(isConfirmReady(11, 460)).toBe(true);
    expect(isConfirmReady(8, 460)).toBe(false);
    expect(isConfirmReady(11, 300)).toBe(false);
  });

  it("accepte un retour au centre leger pour debloquer la question suivante", () => {
    expect(isNeutralEnough("left", 0.03)).toBe(true);
    expect(isNeutralEnough("left", 0.08)).toBe(false);
  });

  it("calcule une force d inclinaison lisible pour l interface", () => {
    expect(getTiltStrength(0.051)).toBeCloseTo(0.5, 2);
    expect(getTiltStrength(HEAD_POSE_CONFIG.indicatorYaw)).toBe(1);
  });
});
