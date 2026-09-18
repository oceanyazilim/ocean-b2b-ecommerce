// The design system's CSS custom properties (--primary, --secondary, ...) are consumed as
// `hsl(var(--x))`, so they need an "H S% L%" triplet — but a theme's color settings come from a
// plain <input type="color"> picker, which only ever produces a hex string. Without this
// conversion, `hsl(#1a1a1a)` is invalid CSS and the browser silently drops the whole
// background/text-color declaration, leaving buttons and other primary-colored elements
// invisible (transparent on transparent) rather than merely mis-colored.
export function hexToHslTriplet(hex: string): string | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const hex6 = match?.[1];
  if (!hex6) return null;
  const r = parseInt(hex6.slice(0, 2), 16) / 255;
  const g = parseInt(hex6.slice(2, 4), 16) / 255;
  const b = parseInt(hex6.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
