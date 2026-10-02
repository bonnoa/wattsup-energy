// Formatage fr-FR : seul endroit où l'on arrondit pour l'affichage (SPEC §10).

// fr-FR utilise des espaces fines insécables (U+202F) comme séparateur de milliers.
function number(value: number, digits: number): string {
  return value.toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatEur(value: number, digits = 0): string {
  return `${number(value, digits)} €`;
}

export function formatEurFromCents(cents: number, digits = 2): string {
  return formatEur(cents / 100, digits);
}

export function formatKwh(value: number, digits = 0): string {
  return `${number(value, digits)} kWh`;
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${number(ratio * 100, digits)} %`;
}
