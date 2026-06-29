/**
 * Coordonnées approximatives (centroïde) par code pays ISO-2.
 * Sert à placer des marqueurs sur le globe (d'où viennent les ventes).
 * Liste pragmatique des pays e-commerce courants ; les inconnus sont ignorés.
 */
export const COUNTRY_COORDS: Record<string, [number, number]> = {
  FR: [46.2276, 2.2137],
  BE: [50.5039, 4.4699],
  CH: [46.8182, 8.2275],
  LU: [49.8153, 6.1296],
  DE: [51.1657, 10.4515],
  ES: [40.4637, -3.7492],
  PT: [39.3999, -8.2245],
  IT: [41.8719, 12.5674],
  GB: [55.3781, -3.436],
  IE: [53.4129, -8.2439],
  NL: [52.1326, 5.2913],
  US: [37.0902, -95.7129],
  CA: [56.1304, -106.3468],
  MA: [31.7917, -7.0926],
  DZ: [28.0339, 1.6596],
  TN: [33.8869, 9.5375],
  SN: [14.4974, -14.4524],
  CI: [7.54, -5.5471],
  CM: [7.3697, 12.3547],
  AE: [23.4241, 53.8478],
  SA: [23.8859, 45.0792],
  AU: [-25.2744, 133.7751],
  BR: [-14.235, -51.9253],
  MX: [23.6345, -102.5528],
  JP: [36.2048, 138.2529],
  CN: [35.8617, 104.1954],
  IN: [20.5937, 78.9629],
  PL: [51.9194, 19.1451],
  SE: [60.1282, 18.6435],
  NO: [60.472, 8.4689],
  DK: [56.2639, 9.5018],
  FI: [61.9241, 25.7482],
  AT: [47.5162, 14.5501],
  GR: [39.0742, 21.8243],
  TR: [38.9637, 35.2433],
}

/** Renvoie [lat, lng] pour un code pays ISO-2, ou null si inconnu. */
export function countryToCoords(code: string | null | undefined): [number, number] | null {
  if (!code) return null
  return COUNTRY_COORDS[code.toUpperCase()] || null
}
