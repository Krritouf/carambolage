// Every tuning value, from data/config.json (each with value, min, max and step), and the levels
// from data/levels.json. The game reads a value live as tune.<name>; the tweak panel, on the dev
// server only, moves CONFIG's values while the game runs.

import data from '../data/config.json';
import levels from '../data/levels.json';
import levelsUk from '../data/levels-uk.json';
import levelsJp from '../data/levels-jp.json';
import levelsUs from '../data/levels-us.json';
import type { Loose } from './game/types';

/** data/config.json as the game reads it: name -> { value, min, max, step }, plus seed. */
export const CONFIG: Loose = data;
/** data/levels.json: the crossroads in play order. */
export const LEVELS: Loose[] = levels;
/** Each country's levels, in play order: France's (data/levels.json), the United Kingdom's (data/levels-uk.json), Japan's (data/levels-jp.json), the United States' (data/levels-us.json). */
export const LEVELS_BY: Record<string, Loose[]> = { fr: levels, uk: levelsUk, jp: levelsJp, us: levelsUs };
(window as Loose).CONFIG = data; // the tweak panel and the checks read it here
(window as Loose).LEVELS = levels;

/** Live reads: tune.speed is CONFIG.speed.value at the moment it is read. */
export const tune: Loose = new Proxy({}, { get: (_: unknown, k: string) => CONFIG[k].value });

if (import.meta.env.DEV) await import('./dev/tune');
