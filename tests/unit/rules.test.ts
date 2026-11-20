// Vitest: the scoring rules in src/game/, run in Node with no browser.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { finalScore, fmt, impactDamage, priceFor, starCount } from '../../src/game/rules';
import { rng, setSeed } from '../../src/game/random';

const star2 = config.star2.value, star3 = config.star3.value, objective = config.threshold_1.value;

describe('rng', () => {
  it('repeats the same numbers for the same seed', () => {
    setSeed(7); const first = [rng(), rng(), rng()];
    setSeed(7); expect([rng(), rng(), rng()]).toEqual(first);
    expect(first.every(n => n >= 0 && n < 1)).toBe(true);
  });
});

describe('starCount', () => {
  it('gives no star below the objective and one at it', () => {
    expect(starCount(objective - 1, objective, star2, star3)).toBe(0);
    expect(starCount(objective, objective, star2, star3)).toBe(1);
  });
  it('gives two stars at star2 x the objective and three at star3 x', () => {
    expect(starCount(objective * star2 - 1, objective, star2, star3)).toBe(1);
    expect(starCount(objective * star2, objective, star2, star3)).toBe(2);
    expect(starCount(objective * star3, objective, star2, star3)).toBe(3);
  });
});

describe('finalScore', () => {
  it('is (damage + bonus) x multiplier x insurance, rounded', () => {
    const bonus = config.bonus_points.value, ins = 1 + config.insurance_bonus.value;
    expect(finalScore(10000, bonus, 2, ins)).toBe(Math.round((10000 + bonus) * 2 * ins));
    expect(finalScore(0, 0, 3, 1)).toBe(0);
  });
});

describe('impactDamage', () => {
  it('pays euros per unit of impulse above half the threshold', () => {
    const th = config.hit_threshold.value, scale = config.damage_scale.value;
    expect(impactDamage(th * 0.5, th, scale)).toBe(0);
    expect(impactDamage(th * 0.5 + 100, th, scale)).toBeCloseTo(100 * scale, 9);
  });
});

describe('priceFor', () => {
  it('multiplies by the vehicle factor and rounds to the nearest 500', () => {
    expect(priceFor(config.dynamite_cost.value, 1)).toBe(config.dynamite_cost.value);
    expect(priceFor(10000, config.my_price_van.value) % 500).toBe(0);
    expect(priceFor(1249, 1)).toBe(1000); // the rounding boundary is the point
    expect(priceFor(1250, 1)).toBe(1500);
  });
});

describe('fmt', () => {
  it('splits thousands with spaces', () => { expect(fmt(1234567.4)).toBe('1 234 567'); });
});
