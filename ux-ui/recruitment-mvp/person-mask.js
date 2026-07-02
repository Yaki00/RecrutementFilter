export function personMaskAlpha(confidence, threshold = 0.42, feather = 0.2) {
  const low = threshold - feather;
  const high = threshold + feather;

  if (confidence <= low) return 0;
  if (confidence >= high) return 255;
  return Math.round(((confidence - low) / (high - low)) * 255);
}

export function fillPersonMaskImageData(imageData, maskValues, threshold = 0.42, feather = 0.2) {
  const pixels = imageData.data;

  for (let i = 0; i < maskValues.length; i += 1) {
    const alpha = personMaskAlpha(maskValues[i], threshold, feather);
    const offset = i * 4;
    pixels[offset] = 255;
    pixels[offset + 1] = 255;
    pixels[offset + 2] = 255;
    pixels[offset + 3] = alpha;
  }

  return imageData;
}
