import { describe, expect, it } from "vitest";
import { createWeatherSystem, getWeatherIntensity } from "./weather-effects.js";

describe("weather-effects", () => {
  it("augmente l intensite avec le mood", () => {
    expect(getWeatherIntensity({ mood: "calm", intensity: 0 })).toBe(0);
    expect(getWeatherIntensity({ mood: "gradient", intensity: 0.5 })).toBeCloseTo(0.675, 2);
    expect(getWeatherIntensity({ mood: "hard", intensity: 1 })).toBe(1);
  });

  it("anime la pluie sans planter", () => {
    const weather = createWeatherSystem();
    weather.resize(640, 360);
    weather.update(16, 0.8);
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      lineTo() {},
      stroke() {},
      set lineCap(_) {},
      set strokeStyle(_) {},
      set lineWidth(_) {},
      set globalAlpha(_) {}
    };
    expect(() => weather.drawRain(ctx, 0.8)).not.toThrow();
  });
});
