export function getWeatherIntensity(moodState) {
  if (!moodState || moodState.mood === "calm") return 0;
  if (moodState.mood === "hard") return 1;
  return 0.35 + moodState.intensity * 0.65;
}

export function createWeatherSystem() {
  let width = 1;
  let height = 1;
  let drops = [];
  let flash = 0;
  let nextFlashAt = 0;
  let elapsed = 0;

  function seedDrops(count) {
    drops = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      len: 8 + Math.random() * 18,
      speed: 10 + Math.random() * 16,
      opacity: 0.15 + Math.random() * 0.45
    }));
  }

  return {
    resize(w, h) {
      width = Math.max(1, w);
      height = Math.max(1, h);
      seedDrops(Math.round((width * height) / 9000));
    },

    update(deltaMs, intensity) {
      elapsed += deltaMs;
      if (intensity <= 0) {
        flash = Math.max(0, flash - deltaMs * 0.006);
        return;
      }

      const speedScale = 0.6 + intensity * 1.4;
      for (const drop of drops) {
        drop.y += drop.speed * speedScale * (deltaMs / 16);
        drop.x -= (1.2 + intensity * 2.2) * (deltaMs / 16);
        if (drop.y > height + drop.len) {
          drop.y = -drop.len;
          drop.x = Math.random() * width;
        }
        if (drop.x < -20) drop.x = width + 20;
      }

      flash = Math.max(0, flash - deltaMs * 0.005);
      if (intensity >= 0.45 && elapsed >= nextFlashAt) {
        flash = 0.55 + intensity * 0.4;
        nextFlashAt = elapsed + (1400 + Math.random() * 2600) / intensity;
      }
    },

    drawRain(ctx, intensity) {
      if (intensity <= 0 || !drops.length) return;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = `rgba(170, 198, 255, ${0.12 + intensity * 0.35})`;
      ctx.lineWidth = 1 + intensity * 0.8;

      for (const drop of drops) {
        ctx.globalAlpha = drop.opacity * intensity;
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - 3 - intensity * 4, drop.y + drop.len);
        ctx.stroke();
      }
      ctx.restore();
    },

    drawLightning(ctx, intensity) {
      if (flash <= 0.02) return;

      const alpha = flash * (0.35 + intensity * 0.45);
      const gradient = ctx.createRadialGradient(
        width * 0.22,
        height * 0.12,
        10,
        width * 0.5,
        height * 0.45,
        Math.max(width, height) * 0.9
      );
      gradient.addColorStop(0, `rgba(235, 244, 255, ${alpha})`);
      gradient.addColorStop(0.35, `rgba(180, 205, 255, ${alpha * 0.35})`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.save();
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },

    getFlash() {
      return flash;
    }
  };
}
