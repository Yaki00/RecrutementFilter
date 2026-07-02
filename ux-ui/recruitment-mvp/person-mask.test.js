import { describe, expect, it } from "vitest";
import { fillPersonMaskImageData, personMaskAlpha } from "./person-mask.js";
import { getBackgroundOverlayStrength } from "./background-effects.js";

describe("person-mask", () => {
  it("retourne 0 pour le fond et 255 pour la personne", () => {
    expect(personMaskAlpha(0.1)).toBe(0);
    expect(personMaskAlpha(0.9)).toBe(255);
  });

  it("adoucit les bords avec une zone de plume", () => {
    const mid = personMaskAlpha(0.42);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(255);
  });

  it("remplit un ImageData avec un canal alpha sur la silhouette", () => {
    const imageData = {
      data: new Uint8ClampedArray(16)
    };
    fillPersonMaskImageData(imageData, [0.1, 0.5, 0.9, 0.2]);

    expect(imageData.data[3]).toBe(0);
    expect(imageData.data[7]).toBeGreaterThan(0);
    expect(imageData.data[11]).toBe(255);
  });
});

describe("background-effects", () => {
  it("renforce l obscurite du fond en mode hard", () => {
    const calm = getBackgroundOverlayStrength({ mood: "calm", intensity: 0 });
    const hard = getBackgroundOverlayStrength({ mood: "hard", intensity: 1 });

    expect(hard.edge).toBeGreaterThan(calm.edge);
    expect(hard.fill).toBeGreaterThan(calm.fill);
  });
});
