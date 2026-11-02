// Motor léxico de moderación (SPEC-06, HU 6.2). Es una función pura, sin base de datos,
// para poder probarla de forma aislada.
//
// Reglas:
// - Ignora mayúsculas y tildes ("FRAUDE" y "fráude" coinciden con "fraude").
// - Compara palabras completas: "spam" no marca "spammer" ni "despampanante".
// - Las palabras compuestas del catálogo (p. ej. "compra_notas") coinciden escritas con
//   guion bajo, guion o espacio: "compra notas", "compra-notas" o "compra_notas".

const COMBINING_MARKS = /[̀-ͯ]/g;

export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Devuelve las palabras prohibidas (tal como están en el catálogo) que aparecen en el texto,
 * sin repetir y en el orden del catálogo. Un arreglo vacío significa que el texto es válido.
 */
export function findBannedWords(text: string, bannedWords: readonly string[]): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const padded = ` ${normalized} `;

  const detected: string[] = [];
  for (const word of bannedWords) {
    const phrase = normalizeText(word);
    if (!phrase) continue;
    if (padded.includes(` ${phrase} `) && !detected.includes(word)) {
      detected.push(word);
    }
  }
  return detected;
}
