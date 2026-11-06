// Motor léxico de moderación (SPEC-06, HU 6.2). Es una función pura, sin base de datos,
// para poder probarla de forma aislada.
//
// Reglas:
// - Normalización simétrica para texto y catálogo (mayúsculas, tildes, signos).
// - Reducción de repeticiones espurias (e.g. "frauuude" -> "fraude").
// - Mapeo de sustituciones leetspeak dentro de palabras ("fr4ude", "fr@ude").
// - Compara palabras completas con propiedades Unicode (\p{L}\p{N}).
// - Palabras compuestas del catálogo (p. ej. "compra_notas") coinciden escritas con
//   guion bajo, guion o espacio: "compra notas", "compra-notas" o "compra_notas".

const COMBINING_MARKS = /[\u0300-\u036f]/g;

const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
  '!': 'i',
};

export function normalizeText(text: string): string {
  if (!text) return '';

  // 1. Descomposición Unicode NFD y remoción de tildes y diacríticos
  let normalized = text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();

  // 2. Reducir 3 o más repeticiones consecutivas a 1 (e.g. "frauuuude" -> "fraude")
  normalized = normalized.replace(/(.)\1{2,}/gu, '$1');

  // 3. Sustitución de leetspeak contextual: solo si está adyacente a letras (no símbolos aislados o puntuación)
  normalized = normalized.replace(/(?<=\p{L})[@$!](?=\p{L})/gu, (char) => LEET_MAP[char] ?? char);
  normalized = normalized.replace(/(?<=\p{L})[013457]|[013457](?=\p{L})/gu, (char) => LEET_MAP[char] ?? char);

  // 4. Convertir caracteres que no sean letras o números Unicode a espacios
  normalized = normalized.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

  return normalized;
}

/**
 * Devuelve las palabras prohibidas (tal como están en el catálogo) que aparecen en el texto,
 * sin repetir y en el orden del catálogo. Un arreglo vacío significa que el texto es válido.
 */
export function findBannedWords(text: string, bannedWords: readonly string[]): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const detected: string[] = [];
  for (const word of bannedWords) {
    const normalizedWord = normalizeText(word);
    if (!normalizedWord) continue;

    // Escapar caracteres para construcción segura de RegExp
    const escapedWord = normalizedWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Delimitar palabra usando propiedades Unicode o límites de cadena
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}])${escapedWord}($|[^\\p{L}\\p{N}])`, 'u');

    if (regex.test(normalized) && !detected.includes(word)) {
      detected.push(word);
    }
  }
  return detected;
}
