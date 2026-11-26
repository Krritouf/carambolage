// The garage setups the autopilot measures: a vehicle and what is fitted on it.
// From bare (what a new player has) to everything, in the order a player would likely buy.

/** A vehicle and its items, as the save stores them (item -> level). */
export interface Setup { car: string; gear: Record<string, number> }

// everything; the country's own gadget (the farmers in France, the loch monster in the UK...) is added per run
const ALL = { engine: 3, bullbar: 1, armor: 1, dynamite: 1, dynamite2: 1, rocket: 1, rocket2: 1, magnet: 1, trex: 1, insurance: 1, extratime: 1, extratime2: 1 };

export const SETUPS: Record<string, Setup> = {
  bare: { car: 'sport', gear: {} },
  // the cheap first buys
  starter: { car: 'sport', gear: { engine: 1, bullbar: 1, extratime: 1 } },
  // + the first gadget
  dyn: { car: 'sport', gear: { engine: 1, bullbar: 1, extratime: 1, dynamite: 1 } },
  // a well-fitted sports car, no T-Rex
  mid: { car: 'sport', gear: { engine: 2, bullbar: 1, armor: 1, extratime: 1, dynamite: 1, rocket: 1, insurance: 1 } },
  full: { car: 'sport', gear: ALL },
  van_bare: { car: 'van', gear: {} },
  van_full: { car: 'van', gear: ALL },
  ambulance_bare: { car: 'ambulance', gear: {} },
  ambulance_full: { car: 'ambulance', gear: ALL },
  truck_bare: { car: 'truck', gear: {} },
  truck_full: { car: 'truck', gear: ALL },
  semi_bare: { car: 'semi', gear: {} },
  semi_full: { car: 'semi', gear: ALL },
};
