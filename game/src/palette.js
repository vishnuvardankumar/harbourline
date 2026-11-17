// Harbourline: a dusk harbour yard. Six colours only, in code and in CSS.
// Canvas is the night sky and floor, surface the concrete, hairline the steel
// crates, ink the painted markings, muted the fog, accent the amber warning paint.
export const PALETTE = {
  canvas: '#1c2836',
  surface: '#3a4750',
  hairline: '#5a6874',
  ink: '#f2ecdd',
  muted: '#aeb9c2',
  accent: '#ff8c1a',
  ally: '#2ec4a6',
  enemy: '#e5484d',
};

export function shade(name) {
  return PALETTE[name];
}
