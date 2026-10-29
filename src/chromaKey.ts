/** Drop pixels near a key color. `amount` is 8–80; higher removes a wider range and softens the edge. */
export function applyChromaKey(pixels: Uint8ClampedArray, key: string, amount: number): void {
  const hex = /^#([0-9a-f]{6})$/i.exec(key);
  if (!hex) return;
  const raw = hex[1];
  const keyRed = Number.parseInt(raw.slice(0, 2), 16);
  const keyGreen = Number.parseInt(raw.slice(2, 4), 16);
  const keyBlue = Number.parseInt(raw.slice(4, 6), 16);
  const limit = (Math.min(80, Math.max(8, amount)) / 100) * 200;
  const soft = limit * 0.55;
  for (let index = 0; index < pixels.length; index += 4) {
    const distance = Math.hypot(pixels[index] - keyRed, pixels[index + 1] - keyGreen, pixels[index + 2] - keyBlue);
    if (distance >= limit) continue;
    pixels[index + 3] = distance <= soft ? 0 : Math.round(pixels[index + 3] * ((distance - soft) / (limit - soft)));
  }
}
