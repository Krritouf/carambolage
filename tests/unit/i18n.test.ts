// Vitest: the English the game draws, from its French source sentences.
import { afterEach, describe, expect, it } from 'vitest';
import { setLang, tr } from '../../src/i18n';

describe('tr', () => {
  afterEach(() => setLang('fr'));
  it('leaves French as it is', () => {
    setLang('fr');
    expect(tr('Le carrefour')).toBe('Le carrefour');
  });
  it('translates a sentence, in capitals too', () => {
    setLang('en');
    expect(tr('Le carrefour')).toBe('The Crossroads');
    expect(tr('LE CARREFOUR')).toBe('THE CROSSROADS');
  });
  it('keeps the numbers of a sentence that has them', () => {
    setLang('en');
    expect(tr('Objectif 14 000 €')).toBe('Goal 14 000 €');
    expect(tr('Détruis 3 bus')).toBe('Destroy 3 buses');
    expect(tr('Fais sauter 1 citerne')).toBe('Blow up 1 tanker');
  });
  it('translates each part of a line split by its dots', () => {
    setLang('en');
    expect(tr('Entrée : réessayer   ·   R : rejouer')).toBe('Enter: try again   ·   R: retry');
  });
  it('shows a sentence it does not know in French, never blank', () => {
    setLang('en');
    expect(tr('Une phrase inconnue')).toBe('Une phrase inconnue');
  });
});
