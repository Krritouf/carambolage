// PROTOTYPE - NOT FOR PRODUCTION
// Question: est-ce que viser le bon moment pour percuter le trafic, puis regarder la réaction en chaîne, donne envie de rejouer ?
// Date: 2026-11-18
// Every tuning value lives here, each with value, min, max and step. The game reads them live
// through tune.<name> (index.html); the tweak panel, an add-on, writes them back here.
// Units: px (world pixels), s (seconds), € (score), impulse = mass x px/s.
window.CONFIG = {
  seed: 1, // every gameplay random call reads rng(), seeded from this (or ?seed= in the address)
  volume: { value: 0.5, min: 0, max: 1, step: 0.05 },

  // ---- Player car (arcade, nervous) ----
  player_max_speed: { value: 440, min: 300, max: 900, step: 10 },   // px/s top speed
  player_boost_speed: { value: 600, min: 500, max: 1200, step: 10 }, // px/s top speed while boosted
  player_accel: { value: 520, min: 200, max: 1500, step: 10 },      // px/s² throttle
  player_brake: { value: 950, min: 200, max: 2000, step: 10 },      // px/s² brake
  player_steer: { value: 3.1, min: 1, max: 6, step: 0.1 },          // rad/s turn rate at speed
  player_grip: { value: 11, min: 2, max: 30, step: 0.5 },           // /s sideways grip while in control
  boost_time: { value: 2.6, min: 0.5, max: 6, step: 0.1 },          // s a boost lasts
  boost_kick: { value: 110, min: 0, max: 500, step: 10 },           // px/s added at pickup

  // ---- Masses (heavier = deflected less), cruise speeds, vehicle values ----
  mass_player: { value: 1.4, min: 0.3, max: 6, step: 0.1 },
  mass_moto: { value: 0.28, min: 0.1, max: 2, step: 0.02 },
  mass_car: { value: 1.0, min: 0.3, max: 4, step: 0.1 },
  mass_taxi: { value: 1.05, min: 0.3, max: 4, step: 0.1 },
  mass_truck: { value: 4.0, min: 1, max: 12, step: 0.1 },
  mass_bus: { value: 5.5, min: 1, max: 14, step: 0.1 },
  mass_tanker: { value: 4.6, min: 1, max: 12, step: 0.1 },
  mass_police: { value: 1.15, min: 0.3, max: 4, step: 0.05 },
  mass_ambulance: { value: 1.9, min: 0.5, max: 6, step: 0.1 },
  mass_fire: { value: 5.2, min: 1, max: 14, step: 0.1 },
  speed_moto: { value: 280, min: 50, max: 600, step: 10 },          // px/s
  speed_car: { value: 240, min: 50, max: 600, step: 10 },
  speed_taxi: { value: 255, min: 50, max: 600, step: 10 },
  speed_truck: { value: 190, min: 50, max: 600, step: 10 },
  speed_bus: { value: 175, min: 50, max: 600, step: 10 },
  speed_tanker: { value: 185, min: 50, max: 600, step: 10 },
  speed_police: { value: 300, min: 50, max: 600, step: 10 },
  speed_ambulance: { value: 270, min: 50, max: 600, step: 10 },
  speed_fire: { value: 215, min: 50, max: 600, step: 10 },
  value_moto: { value: 4000, min: 500, max: 40000, step: 500 },     // € max damage on one vehicle
  value_car: { value: 9000, min: 500, max: 40000, step: 500 },
  value_taxi: { value: 10000, min: 500, max: 40000, step: 500 },
  value_truck: { value: 26000, min: 500, max: 80000, step: 500 },
  value_bus: { value: 32000, min: 500, max: 80000, step: 500 },
  value_tanker: { value: 30000, min: 500, max: 80000, step: 500 },
  value_police: { value: 12000, min: 500, max: 40000, step: 500 },
  value_ambulance: { value: 18000, min: 500, max: 60000, step: 500 },
  value_fire: { value: 40000, min: 500, max: 100000, step: 500 },
  value_player: { value: 12000, min: 500, max: 40000, step: 500 },  // only shown as dents, never scored

  // ---- Impacts ----
  restitution: { value: 0.3, min: 0, max: 1, step: 0.05 },
  contact_friction: { value: 0.45, min: 0, max: 1.5, step: 0.05 },
  inertia_scale: { value: 1.8, min: 0.5, max: 5, step: 0.1 },       // >1 = vehicles spin less
  max_spin: { value: 11, min: 2, max: 30, step: 0.5 },              // rad/s cap
  damage_scale: { value: 9, min: 1, max: 60, step: 0.5 },          // € per unit of impulse
  hit_threshold: { value: 22, min: 1, max: 200, step: 1 },          // impulse below this scores nothing
  lift_light: { value: 0.75, min: 0, max: 2, step: 0.05 },          // light vehicles (moto) fly: vz per dv
  lift_heavy: { value: 0.12, min: 0, max: 1, step: 0.01 },          // others hop a little
  light_mass: { value: 0.5, min: 0.1, max: 2, step: 0.05 },         // below this mass a vehicle "flies"
  gravity: { value: 950, min: 200, max: 3000, step: 10 },           // px/s²
  land_damage: { value: 0.9, min: 0, max: 4, step: 0.05 },          // landing on a vehicle: impulse per px/s fall
  tanker_blast: { value: 1700, min: 0, max: 5000, step: 50 },       // impulse at the centre of a tanker blast
  tanker_radius: { value: 230, min: 50, max: 500, step: 10 },       // px
  tanker_trigger: { value: 45, min: 1, max: 500, step: 1 },         // impulse that lights a tanker's fuse
  tanker_fuse: { value: 0.45, min: 0, max: 3, step: 0.05 },         // s between the hit and the blast

  // ---- Oil ----
  oil_drop_gap: { value: 12, min: 4, max: 60, step: 1 },            // px between drops along a leaking vehicle's slide
  oil_radius: { value: 13, min: 4, max: 40, step: 1 },              // px of one drop (the final pool is x2.3)
  oil_max: { value: 700, min: 50, max: 3000, step: 50 },            // drops kept on the road
  oil_spin: { value: 7, min: 0, max: 20, step: 0.5 },               // rad/s of spin given on reaching oil
  oil_grip: { value: 0.15, min: 0, max: 1, step: 0.05 },            // x the slide friction while on oil
  oil_time: { value: 0.8, min: 0.1, max: 3, step: 0.05 },           // s the grip stays low after the last oil

  // ---- The garage ----
  engine_step: { value: 0.12, min: 0, max: 0.5, step: 0.01 },       // + top speed and accel per engine level
  engine_cost_1: { value: 30000, min: 0, max: 200000, step: 500 },   // €
  engine_cost_2: { value: 75000, min: 0, max: 200000, step: 500 },
  engine_cost_3: { value: 165000, min: 0, max: 1000000, step: 500 },
  bullbar_cost: { value: 60000, min: 0, max: 200000, step: 500 },
  bullbar_time: { value: 1, min: 0.1, max: 5, step: 0.1 },          // s you keep the wheel after the first impact
  dynamite_cost: { value: 90000, min: 0, max: 300000, step: 500 },
  dynamite_blast: { value: 1600, min: 0, max: 5000, step: 50 },     // impulse at the centre
  dynamite_radius: { value: 210, min: 50, max: 500, step: 10 },     // px
  armor_cost: { value: 150000, min: 0, max: 300000, step: 500 },     // € (needs the bull bar)
  armor_time: { value: 2, min: 0.1, max: 6, step: 0.1 },            // s of wheel added to the bull bar's
  rocket_cost: { value: 225000, min: 0, max: 1000000, step: 500 },
  rockets_per_run: { value: 2, min: 1, max: 10, step: 1 },
  rocket_speed: { value: 950, min: 200, max: 2500, step: 10 },      // px/s
  rocket_blast: { value: 1400, min: 0, max: 5000, step: 50 },       // impulse at the centre
  rocket_radius: { value: 150, min: 30, max: 500, step: 10 },       // px
  magnet_cost: { value: 195000, min: 0, max: 400000, step: 500 },
  magnet_time: { value: 3, min: 0.5, max: 10, step: 0.5 },          // s after the first impact
  magnet_radius: { value: 280, min: 50, max: 800, step: 10 },       // px
  magnet_force: { value: 650, min: 0, max: 3000, step: 10 },        // px/s² pull
  nitro_cost: { value: 105000, min: 0, max: 400000, step: 500 },
  nitro_kick: { value: 380, min: 0, max: 1500, step: 10 },          // px/s added at once
  nitro_time: { value: 1.2, min: 0.2, max: 5, step: 0.1 },          // s of raised top speed
  nitro_top: { value: 1.35, min: 1, max: 3, step: 0.05 },           // x the boost top speed
  oilcan_cost: { value: 75000, min: 0, max: 400000, step: 500 },
  oilcan_time: { value: 2.5, min: 0.5, max: 8, step: 0.1 },         // s of oil laid behind you
  jump_cost: { value: 135000, min: 0, max: 400000, step: 500 },
  jump_speed: { value: 430, min: 100, max: 1200, step: 10 },        // px/s up
  jumps_per_run: { value: 1, min: 1, max: 5, step: 1 },
  insurance_cost: { value: 180000, min: 0, max: 400000, step: 500 },
  insurance_bonus: { value: 0.25, min: 0, max: 2, step: 0.05 },     // + on the final score
  extratime_cost: { value: 90000, min: 0, max: 400000, step: 500 },
  extratime_s: { value: 3, min: 0.5, max: 10, step: 0.5 },          // s added to the countdown

  // ---- Weather, events, replay ----
  rain_grip: { value: 0.55, min: 0.1, max: 1, step: 0.05 },         // x grip and braking in the rain
  ice_grip: { value: 0.33, min: 0.05, max: 1, step: 0.01 },         // x grip and braking on ice
  event_progress: { value: 0.55, min: 0.1, max: 0.95, step: 0.05 }, // the event fires when the car is this far from the junction (fraction of the street)
  event_dist: { value: 700, min: 200, max: 1500, step: 10 },        // px from the junction where event vehicles appear
  value_giant: { value: 80000, min: 1000, max: 300000, step: 1000 },// € the giant tanker is worth
  replay_slow: { value: 0.4, min: 0.1, max: 1, step: 0.05 },        // x speed at the start of the replay
  replay_fast: { value: 2.5, min: 1, max: 6, step: 0.1 },           // x speed after that
  replay_slow_time: { value: 2.5, min: 0, max: 10, step: 0.1 },     // s of the pile-up shown slow
  replay_zoom: { value: 0.7, min: 0.3, max: 1.5, step: 0.01 },

  // ---- Vehicles you can drive (bought in the garage); the sports car uses mass_player ----
  my_price_sport: { value: 1, min: 1, max: 10, step: 0.1 },         // x the garage prices while you drive the sports car
  my_mass_van: { value: 2.2, min: 0.5, max: 10, step: 0.1 },
  my_speed_van: { value: 0.95, min: 0.3, max: 1.5, step: 0.05 },    // x top speed
  my_steer_van: { value: 0.9, min: 0.3, max: 1.5, step: 0.05 },     // x turn rate
  my_stars_van: { value: 6, min: 0, max: 60, step: 1 },          // stars to unlock it
  my_price_van: { value: 1.6, min: 1, max: 10, step: 0.1 },        // x the garage prices while you drive it
  my_mass_ambulance: { value: 2.4, min: 0.5, max: 10, step: 0.1 },
  my_speed_ambulance: { value: 1, min: 0.3, max: 1.5, step: 0.05 },
  my_steer_ambulance: { value: 0.85, min: 0.3, max: 1.5, step: 0.05 },
  my_stars_ambulance: { value: 15, min: 0, max: 60, step: 1 },          // stars to unlock it
  my_price_ambulance: { value: 2.3, min: 1, max: 10, step: 0.1 },        // x the garage prices while you drive it
  my_mass_truck: { value: 4.5, min: 0.5, max: 12, step: 0.1 },
  my_speed_truck: { value: 0.85, min: 0.3, max: 1.5, step: 0.05 },
  my_steer_truck: { value: 0.7, min: 0.3, max: 1.5, step: 0.05 },
  my_stars_truck: { value: 27, min: 0, max: 60, step: 1 },          // stars to unlock it
  my_price_truck: { value: 3.4, min: 1, max: 10, step: 0.1 },        // x the garage prices while you drive it
  my_mass_semi: { value: 3.6, min: 0.5, max: 12, step: 0.1 },
  my_speed_semi: { value: 0.85, min: 0.3, max: 1.5, step: 0.05 },
  my_steer_semi: { value: 0.75, min: 0.3, max: 1.5, step: 0.05 },
  my_stars_semi: { value: 42, min: 0, max: 60, step: 1 },          // stars to unlock it
  my_price_semi: { value: 4.8, min: 1, max: 10, step: 0.1 },        // x the garage prices while you drive it
  mass_trailer: { value: 4, min: 0.5, max: 12, step: 0.1 },         // the semi's trailer
  value_trailer: { value: 20000, min: 500, max: 80000, step: 500 }, // only shown as dents, never scored

  // ---- Sliding wrecks ----
  skid_lateral: { value: 3.2, min: 0.5, max: 20, step: 0.5 },       // /s sideways slide decay once loose
  skid_forward: { value: 0.9, min: 0, max: 10, step: 0.1 },         // /s rolling decay once loose
  skid_brake: { value: 140, min: 0, max: 1000, step: 10 },          // px/s² constant scrub once loose
  spin_damping: { value: 1.6, min: 0, max: 10, step: 0.1 },         // /s

  // ---- Traffic ----
  traffic_brake: { value: 270, min: 50, max: 2000, step: 10 },      // px/s², low enough that they pile in
  traffic_lookahead: { value: 0.9, min: 0.1, max: 3, step: 0.05 },  // s ahead a driver watches
  traffic_reaction: { value: 0.6, min: 0, max: 2, step: 0.05 },    // s before a driver sees a wreck
  wreck_brake: { value: 0.3, min: 0, max: 1, step: 0.05 },          // x traffic_brake once the crash has started: drivers pile in
  lane_width: { value: 38, min: 28, max: 60, step: 1 },             // px

  // ---- Ramp (level 3) ----
  ramp_lift: { value: 0.52, min: 0.1, max: 1.5, step: 0.02 },       // vz at take-off per px/s of speed
  ramp_height: { value: 22, min: 5, max: 60, step: 1 },             // px

  // ---- Bonuses ----
  bonus_points: { value: 2000, min: 0, max: 20000, step: 250 },     // € per points pickup
  mult_step: { value: 1, min: 0.5, max: 3, step: 0.5 },             // added to the end multiplier

  // ---- The run ----
  approach_time: { value: 22, min: 5, max: 90, step: 1 },           // s to reach the crossroads
  intro_time: { value: 2.2, min: 0, max: 6, step: 0.1 },            // s of flyover before the start
  slowmo: { value: 0.33, min: 0.05, max: 1, step: 0.01 },           // time scale right after the impact
  slowmo_time: { value: 0.8, min: 0, max: 3, step: 0.05 },          // s of slow motion (real time)
  crash_countdown: { value: 10, min: 2, max: 20, step: 0.5 },        // s from the first impact to the damage count
  threshold_1: { value: 14000, min: 0, max: 6000000, step: 500 },    // € to clear level 1
  threshold_2: { value: 120000, min: 0, max: 6000000, step: 500 },    // € to clear level 2
  threshold_3: { value: 250000, min: 0, max: 6000000, step: 500 },    // € to clear level 3
  threshold_4: { value: 450000, min: 0, max: 6000000, step: 500 },    // € to clear level 4
  threshold_5: { value: 700000, min: 0, max: 6000000, step: 500 },   // € to clear level 5
  threshold_6: { value: 1000000, min: 0, max: 6000000, step: 500 },  // € to clear level 6
  threshold_7: { value: 1300000, min: 0, max: 6000000, step: 500 },  // € to clear level 7
  threshold_8: { value: 1700000, min: 0, max: 6000000, step: 500 },  // € to clear level 8
  threshold_9: { value: 2200000, min: 0, max: 6000000, step: 500 },  // € to clear level 9
  threshold_10: { value: 2800000, min: 0, max: 30000000, step: 1000 }, // € to clear level 10
  threshold_11: { value: 3400000, min: 0, max: 30000000, step: 1000 }, // € to clear level 11
  threshold_12: { value: 4000000, min: 0, max: 30000000, step: 1000 }, // € to clear level 12
  threshold_13: { value: 4800000, min: 0, max: 30000000, step: 1000 }, // € to clear level 13
  threshold_14: { value: 5600000, min: 0, max: 30000000, step: 1000 }, // € to clear level 14
  threshold_15: { value: 6500000, min: 0, max: 30000000, step: 1000 }, // € to clear level 15
  threshold_16: { value: 7500000, min: 0, max: 30000000, step: 1000 }, // € to clear level 16
  threshold_17: { value: 8600000, min: 0, max: 30000000, step: 1000 }, // € to clear level 17
  threshold_18: { value: 10000000, min: 0, max: 30000000, step: 1000 }, // € to clear level 18
  threshold_19: { value: 12000000, min: 0, max: 30000000, step: 1000 }, // € to clear level 19
  star2: { value: 2.0, min: 1, max: 5, step: 0.1 },                 // x the objective for 2 stars
  star3: { value: 3.2, min: 1, max: 8, step: 0.1 },                 // x the objective for 3 stars
  daily_base: { value: 90000, min: 1000, max: 200000, step: 1000 }, // € per lane for the daily's objective
  spawn_scale: { value: 1, min: 0.3, max: 3, step: 0.05 },          // x on every lane's spawn gap

  // ---- Camera and fake 3D ----
  persp: { value: 0.0016, min: 0, max: 0.004, step: 0.0001 },       // roof lean per px of height
  persp_center_y: { value: 0.56, min: 0.3, max: 1, step: 0.01 },    // where the view looks down from (0..1 of screen)
  zoom_drive: { value: 0.86, min: 0.4, max: 1.5, step: 0.01 },
  zoom_speed: { value: 0.18, min: 0, max: 0.5, step: 0.01 },        // zoom out at top speed
  zoom_crash: { value: 0.78, min: 0.3, max: 1.5, step: 0.01 },
  touch_ui: { value: 1.3, min: 1, max: 2, step: 0.05 },            // x size of the HUD and play buttons on a phone
  touch_zoom: { value: 1.3, min: 1, max: 2, step: 0.05 },          // x camera zoom on a phone (driving and crash)
  look_ahead: { value: 230, min: 0, max: 500, step: 10 },           // px the camera leads the car
};

// Levels: the layout of each crossroads. Numbers a designer tunes live above; these are the maps.
window.LEVELS = [
  // challenges: destroy (kind, n) · blasts (tankers blown) · hits (vehicles touched) · score; reward in € of garage credit, won once
  // events: surprises halfway up the street (convoy, chase, giant) · rain · night · median (motorway barrier)
  {
    name: 'Le carrefour', lanes: 1, approach: 1700,
    mix: { car: 5, taxi: 3, moto: 3 },
    spawn: [1.5, 2.7], // s between vehicles on one lane
    pickups: [ ['points', 19, 1350], ['mult', -19, 1050], ['boost', 19, 720] ],
    ramp: false,
    challenges: [ { type: 'hits', n: 4, reward: 3000 }, { type: 'destroy', kind: 'moto', n: 1, reward: 3000 }, { type: 'score', n: 25000, reward: 5000 } ],
  },
  {
    name: 'Le boulevard', lanes: 2, approach: 1800,
    mix: { car: 4, taxi: 2, moto: 3, bus: 2, truck: 2, tanker: 1, police: 1 },
    spawn: [1.3, 2.4],
    pickups: [ ['points', -19, 1450], ['boost', 19, 1150], ['mult', -19, 820], ['points', 19, 560] ],
    ramp: false,
    challenges: [ { type: 'destroy', kind: 'bus', n: 1, reward: 5000 }, { type: 'blasts', n: 1, reward: 6000 }, { type: 'hits', n: 8, reward: 5000 } ],
  },
  {
    name: 'Le tremplin', lanes: 3, approach: 1900,
    mix: { car: 3, taxi: 2, moto: 3, bus: 3, truck: 2, tanker: 2, police: 1, ambulance: 1 },
    spawn: [1.15, 2.1],
    pickups: [ ['mult', 19, 1550], ['points', -19, 1250], ['boost', 0, 900] ],
    ramp: { from: 150, len: 110 }, // px south of the boulevard's sidewalk; a barrier closes the road before it
    events: ['convoy'],
    challenges: [ { type: 'blasts', n: 2, reward: 8000 }, { type: 'destroy', kind: 'truck', n: 1, reward: 6000 }, { type: 'score', n: 500000, reward: 10000 } ],
  },
  {
    name: "L'heure de pointe", lanes: 4, approach: 2000, speedMul: 1.1,
    mix: { car: 5, taxi: 3, moto: 3, bus: 2, truck: 2, tanker: 2, police: 2, ambulance: 1, fire: 1 },
    spawn: [0.8, 1.5],
    pickups: [ ['points', 19, 1750], ['mult', -19, 1450], ['boost', 19, 1100], ['points', -19, 800], ['mult', 19, 500] ],
    ramp: false, events: ['chase'],
    challenges: [ { type: 'destroy', kind: 'police', n: 2, reward: 8000 }, { type: 'hits', n: 15, reward: 8000 }, { type: 'blasts', n: 2, reward: 8000 } ],
  },
  {
    name: 'Le convoi', lanes: 4, approach: 2100, speedMul: 1.15, oilPatches: 6,
    mix: { tanker: 6, truck: 3, car: 3, moto: 2, fire: 2, police: 1 },
    spawn: [0.9, 1.6],
    pickups: [ ['mult', -19, 1850], ['points', 19, 1550], ['mult', 19, 1250], ['boost', 0, 900] ],
    ramp: { from: 170, len: 120 }, events: ['giant', 'convoy'],
    challenges: [ { type: 'blasts', n: 4, reward: 12000 }, { type: 'destroy', kind: 'fire', n: 1, reward: 10000 }, { type: 'hits', n: 18, reward: 10000 } ],
  },
  {
    name: 'Le grand chaos', lanes: 5, approach: 2200, speedMul: 1.25, oilPatches: 10,
    mix: { car: 4, taxi: 3, moto: 4, bus: 3, truck: 3, tanker: 4, police: 3, ambulance: 2, fire: 2 },
    spawn: [0.7, 1.3],
    pickups: [ ['mult', 19, 1950], ['points', -19, 1700], ['mult', -19, 1400], ['points', 19, 1150], ['boost', 0, 900] ],
    ramp: { from: 180, len: 130 }, events: ['convoy', 'chase', 'giant'],
    challenges: [ { type: 'blasts', n: 5, reward: 15000 }, { type: 'destroy', kind: 'ambulance', n: 2, reward: 15000 }, { type: 'hits', n: 25, reward: 15000 } ],
  },
  {
    name: 'Sous la pluie', lanes: 4, approach: 2000, speedMul: 1.15, rain: true, oilPatches: 4,
    mix: { car: 5, taxi: 3, moto: 4, bus: 2, truck: 2, tanker: 2, police: 2, ambulance: 1 },
    spawn: [0.8, 1.4],
    pickups: [ ['points', 19, 1700], ['mult', -19, 1400], ['boost', 19, 1050], ['mult', 19, 600] ],
    ramp: false, events: ['chase', 'convoy'],
    challenges: [ { type: 'destroy', kind: 'taxi', n: 3, reward: 18000 }, { type: 'hits', n: 20, reward: 18000 }, { type: 'score', n: 2500000, reward: 18000 } ],
  },
  {
    name: 'Nuit noire', lanes: 5, approach: 2100, speedMul: 1.2, night: true, oilPatches: 6,
    mix: { car: 4, taxi: 3, moto: 3, bus: 2, truck: 3, tanker: 4, police: 2, ambulance: 1, fire: 2 },
    spawn: [0.75, 1.35],
    pickups: [ ['mult', 19, 1850], ['points', -19, 1550], ['mult', -19, 1250], ['boost', 0, 900] ],
    ramp: { from: 180, len: 130 }, events: ['giant', 'chase'],
    challenges: [ { type: 'blasts', n: 6, reward: 20000 }, { type: 'destroy', kind: 'fire', n: 2, reward: 20000 }, { type: 'hits', n: 28, reward: 20000 } ],
  },
  {
    name: "L'autoroute", lanes: 6, approach: 2300, speedMul: 1.4, median: true, rain: true, oilPatches: 8,
    mix: { car: 5, taxi: 2, moto: 4, bus: 3, truck: 4, tanker: 4, police: 3, ambulance: 2, fire: 2 },
    spawn: [0.6, 1.1],
    pickups: [ ['mult', 19, 2050], ['points', -19, 1750], ['mult', -19, 1450], ['points', 19, 1150], ['boost', 0, 950] ],
    ramp: { from: 200, len: 140 }, events: ['convoy', 'giant', 'chase'],
    challenges: [ { type: 'blasts', n: 6, reward: 25000 }, { type: 'destroy', kind: 'bus', n: 3, reward: 25000 }, { type: 'hits', n: 35, reward: 25000 } ],
  },
  {
    name: 'Brouillard', lanes: 4, approach: 2000, speedMul: 1.25, fog: true,
    mix: { car: 5, taxi: 3, moto: 3, bus: 2, truck: 3, tanker: 3, police: 2, ambulance: 1, fire: 1 },
    spawn: [0.7, 1.3],
    pickups: [ ['mult', 19, 1700], ['points', -19, 1400], ['mult', -19, 1100], ['boost', 19, 800] ],
    ramp: false, events: ['chase', 'giant'],
    challenges: [ { type: 'blasts', n: 4, reward: 30000 }, { type: 'destroy', kind: 'truck', n: 3, reward: 30000 }, { type: 'hits', n: 30, reward: 30000 } ],
  },
  {
    name: 'Verglas', lanes: 3, approach: 1900, speedMul: 1.1, ice: true,
    mix: { car: 5, taxi: 2, moto: 3, bus: 2, truck: 2, tanker: 4, police: 1, fire: 1 },
    spawn: [0.8, 1.4],
    pickups: [ ['points', 19, 1600], ['mult', -19, 1300], ['boost', 0, 900] ],
    ramp: { from: 150, len: 110 }, events: ['convoy'],
    challenges: [ { type: 'blasts', n: 5, reward: 35000 }, { type: 'destroy', kind: 'moto', n: 3, reward: 35000 }, { type: 'score', n: 7000000, reward: 35000 } ],
  },
  {
    name: 'La rue courte', lanes: 5, approach: 1200, speedMul: 1.3,
    mix: { car: 4, taxi: 3, moto: 3, bus: 3, truck: 3, tanker: 3, police: 2, ambulance: 2, fire: 2 },
    spawn: [0.6, 1.2],
    pickups: [ ['mult', 19, 950], ['boost', -19, 700], ['points', 19, 450] ],
    ramp: false, events: ['chase'],
    challenges: [ { type: 'hits', n: 35, reward: 40000 }, { type: 'destroy', kind: 'bus', n: 3, reward: 40000 }, { type: 'blasts', n: 5, reward: 40000 } ],
  },
  {
    name: 'Convoi de nuit', lanes: 5, approach: 2200, speedMul: 1.25, night: true, oilPatches: 6,
    mix: { tanker: 7, truck: 4, car: 3, police: 2, fire: 2 },
    spawn: [0.75, 1.3],
    pickups: [ ['mult', 19, 1900], ['points', -19, 1600], ['mult', -19, 1300], ['boost', 0, 950] ],
    ramp: { from: 180, len: 130 }, events: ['convoy', 'giant'],
    challenges: [ { type: 'blasts', n: 8, reward: 45000 }, { type: 'destroy', kind: 'police', n: 3, reward: 45000 }, { type: 'hits', n: 35, reward: 45000 } ],
  },
  {
    name: 'Tempête', lanes: 5, approach: 2200, speedMul: 1.3, rain: true, night: true, oilPatches: 10,
    mix: { car: 4, taxi: 3, moto: 3, bus: 3, truck: 3, tanker: 4, police: 2, ambulance: 2, fire: 2 },
    spawn: [0.65, 1.2],
    pickups: [ ['mult', -19, 1900], ['points', 19, 1600], ['mult', 19, 1300], ['boost', 0, 950] ],
    ramp: { from: 180, len: 130 }, events: ['convoy', 'chase', 'giant'],
    challenges: [ { type: 'blasts', n: 7, reward: 50000 }, { type: 'destroy', kind: 'ambulance', n: 3, reward: 50000 }, { type: 'score', n: 11000000, reward: 50000 } ],
  },
  {
    name: 'Les motards', lanes: 4, approach: 2000, speedMul: 1.35,
    mix: { moto: 14, car: 3, police: 3, tanker: 2, bus: 1 },
    spawn: [0.5, 0.9],
    pickups: [ ['mult', 19, 1700], ['boost', -19, 1350], ['mult', -19, 1000], ['points', 19, 700] ],
    ramp: false, events: ['chase'],
    challenges: [ { type: 'destroy', kind: 'moto', n: 12, reward: 55000 }, { type: 'hits', n: 40, reward: 55000 }, { type: 'blasts', n: 3, reward: 55000 } ],
  },
  {
    name: 'Pompiers en folie', lanes: 5, approach: 2100, speedMul: 1.3, oilPatches: 6,
    mix: { fire: 6, ambulance: 5, police: 5, car: 3, tanker: 3 },
    spawn: [0.7, 1.2],
    pickups: [ ['mult', 19, 1800], ['points', -19, 1500], ['mult', -19, 1200], ['boost', 19, 850] ],
    ramp: false, events: ['chase', 'giant'],
    challenges: [ { type: 'destroy', kind: 'fire', n: 4, reward: 60000 }, { type: 'destroy', kind: 'ambulance', n: 4, reward: 60000 }, { type: 'destroy', kind: 'police', n: 5, reward: 60000 } ],
  },
  {
    name: 'Autoroute de nuit', lanes: 6, approach: 2300, speedMul: 1.45, median: true, night: true, oilPatches: 8,
    mix: { car: 5, taxi: 2, moto: 3, bus: 3, truck: 4, tanker: 5, police: 3, ambulance: 2, fire: 2 },
    spawn: [0.55, 1.0],
    pickups: [ ['mult', 19, 2050], ['points', -19, 1750], ['mult', -19, 1450], ['points', 19, 1150], ['boost', 0, 950] ],
    ramp: { from: 200, len: 140 }, events: ['convoy', 'giant', 'chase'],
    challenges: [ { type: 'blasts', n: 8, reward: 65000 }, { type: 'destroy', kind: 'bus', n: 4, reward: 65000 }, { type: 'hits', n: 45, reward: 65000 } ],
  },
  {
    name: 'Blizzard', lanes: 6, approach: 2300, speedMul: 1.35, ice: true, fog: true, oilPatches: 6,
    mix: { car: 5, taxi: 2, moto: 3, bus: 3, truck: 4, tanker: 5, police: 2, ambulance: 2, fire: 2 },
    spawn: [0.6, 1.1],
    pickups: [ ['mult', -19, 2050], ['points', 19, 1750], ['mult', 19, 1450], ['boost', 0, 950] ],
    ramp: { from: 200, len: 140 }, events: ['giant', 'convoy'],
    challenges: [ { type: 'blasts', n: 8, reward: 70000 }, { type: 'hits', n: 45, reward: 70000 }, { type: 'score', n: 20000000, reward: 70000 } ],
  },
  {
    name: 'Le grand final', lanes: 7, approach: 2400, speedMul: 1.5, rain: true, night: true, oilPatches: 14,
    mix: { car: 4, taxi: 3, moto: 4, bus: 3, truck: 4, tanker: 6, police: 3, ambulance: 3, fire: 3 },
    spawn: [0.5, 0.9],
    pickups: [ ['mult', 19, 2150], ['points', -19, 1850], ['mult', -19, 1550], ['points', 19, 1250], ['boost', 0, 1000] ],
    ramp: { from: 210, len: 150 }, events: ['convoy', 'chase', 'giant'],
    challenges: [ { type: 'blasts', n: 12, reward: 80000 }, { type: 'destroy', kind: 'fire', n: 4, reward: 80000 }, { type: 'hits', n: 60, reward: 80000 } ],
  },
];
