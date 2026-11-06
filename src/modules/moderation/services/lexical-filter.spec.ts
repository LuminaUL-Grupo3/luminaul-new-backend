import { findBannedWords, normalizeText } from './lexical-filter';

/** SPEC-06 / HU 6.2: motor léxico de moderación, sin base de datos. */
describe('SPEC-06 motor léxico', () => {
  const catalog = ['estafa', 'plagio', 'fraude', 'spam', 'compra_notas', 'insulto'];

  it('normaliza mayúsculas, tildes y signos', () => {
    expect(normalizeText('¡FRÁUDE, total!')).toBe('fraude total');
  });

  it('detecta palabras prohibidas sin importar mayúsculas ni tildes', () => {
    expect(findBannedWords('Esto es un FRÁUDE', catalog)).toEqual(['fraude']);
  });

  it('compara palabras completas y no partes de otras palabras', () => {
    expect(findBannedWords('El spammer escribió algo despampanante', catalog)).toEqual([]);
  });

  it('detecta palabras compuestas escritas con espacio, guion o guion bajo', () => {
    expect(findBannedWords('hago compra notas', catalog)).toEqual(['compra_notas']);
    expect(findBannedWords('hago compra-notas', catalog)).toEqual(['compra_notas']);
    expect(findBannedWords('hago compra_notas', catalog)).toEqual(['compra_notas']);
  });

  it('devuelve cada palabra una sola vez y en el orden del catálogo', () => {
    expect(findBannedWords('spam, estafa y más spam', catalog)).toEqual(['estafa', 'spam']);
  });

  it('acepta textos vacíos o limpios', () => {
    expect(findBannedWords('', catalog)).toEqual([]);
    expect(findBannedWords('Repaso de patrones el sábado', catalog)).toEqual([]);
  });

  it('detecta evasión por repetición de caracteres espurios', () => {
    expect(findBannedWords('Esto es un frauuuude total', catalog)).toEqual(['fraude']);
  });

  it('detecta evasión por sustituciones leetspeak', () => {
    expect(findBannedWords('vaya fr4ude', catalog)).toEqual(['fraude']);
    expect(findBannedWords('cuidado con la est@fa', catalog)).toEqual(['estafa']);
  });
});
