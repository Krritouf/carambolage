// Vitest: the scoring rules in src/game/, run in Node with no browser.
import { describe, expect, it } from 'vitest';
import config from '../../data/config.json';
import { finalScore, fmt, impactDamage, levelTargets, priceFor, starsAt } from '../../src/game/rules';
import { rng, setSeed } from '../../src/game/random';


describe('rng', () => {
  it('repeats the same numbers for the same seed', () => {
    setSeed(7); const first = [rng(), rng(), rng()];
    setSeed(7); expect([rng(), rng(), rng()]).toEqual(first);
    expect(first.every(n => n >= 0 && n < 1)).toBe(true);
  });
});

describe('starsAt', () => {
  const targets = [1000, 2500, 4000]; // [1, 2, 3 stars]
  it('gives no star below the objective and one at it', () => {
    expect(starsAt(999, targets)).toBe(0);
    expect(starsAt(1000, targets)).toBe(1);
  });
  it('gives two stars at the second target and three at the third', () => {
    expect(starsAt(2499, targets)).toBe(1);
    expect(starsAt(2500, targets)).toBe(2);
    expect(starsAt(3999, targets)).toBe(2);
    expect(starsAt(4000, targets)).toBe(3);
  });
});

describe('levelTargets', () => {
  it("uses a level's own 2- and 3-star scores when the config has them", () => {
    const tune = { threshold_3: 1000, star2_3: 1800, star3_3: 5000, star2: 2, star3: 3.2 };
    expect(levelTargets(3, tune)).toEqual([1000, 1800, 5000]);
  });
  it("reads a country's own keys with its prefix", () => {
    const tune = { threshold_3: 1000, uk_threshold_3: 5000, uk_star2_3: 7000, uk_star3_3: 9000, star2: 2, star3: 3.2 };
    expect(levelTargets(3, tune, 'uk_')).toEqual([5000, 7000, 9000]);
  });
  it('falls back to the objective times the shared ratios', () => {
    const tune = { threshold_3: 1000, star2: 2, star3: 3.2 };
    expect(levelTargets(3, tune)).toEqual([1000, 2000, 3200]);
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
