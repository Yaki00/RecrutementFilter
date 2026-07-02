import { describe, expect, it } from "vitest";
import { getPersonTintStrength, getSadnessLevel } from "./face-expression.js";

describe("face-expression", () => {
  it("reste neutre sans mauvaise reponse", () => {
    expect(getSadnessLevel(0)).toBe(0);
  });

  it("augmente progressivement avec les mauvaises reponses", () => {
    expect(getSadnessLevel(1)).toBeCloseTo(1 / 7, 4);
    expect(getSadnessLevel(4)).toBeCloseTo(4 / 7, 4);
  });

  it("plafonne la tristesse a 1", () => {
    expect(getSadnessLevel(10)).toBe(1);
  });

  it("renforce la teinte sur la personne avec la tristesse", () => {
    const low = getPersonTintStrength(0.2);
    const high = getPersonTintStrength(0.9);

    expect(high.cool).toBeGreaterThan(low.cool);
    expect(high.dim).toBeGreaterThan(low.dim);
  });
});
