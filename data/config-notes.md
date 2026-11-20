# The values' notes

What `prototypes/carambolage/config.js` said beside its values, kept here because `data/config.json`
holds no comments. The values themselves are in `data/config.json`.

- `seed`: every gameplay random call reads rng(), seeded from this (or ?seed= in the address)

---- Player car (arcade, nervous) ----
- `player_max_speed`: px/s top speed
- `player_boost_speed`: px/s top speed while boosted
- `player_accel`: px/s² throttle
- `player_brake`: px/s² brake
- `player_steer`: rad/s turn rate at speed
- `player_grip`: /s sideways grip while in control
- `boost_time`: s a boost lasts
- `boost_kick`: px/s added at pickup

---- Masses (heavier = deflected less), cruise speeds, vehicle values ----
- `speed_moto`: px/s
- `value_moto`: € max damage on one vehicle
- `value_player`: only shown as dents, never scored

---- Impacts ----
- `inertia_scale`: >1 = vehicles spin less
- `max_spin`: rad/s cap
- `damage_scale`: € per unit of impulse
- `hit_threshold`: impulse below this scores nothing
- `lift_light`: light vehicles (moto) fly: vz per dv
- `lift_heavy`: others hop a little
- `light_mass`: below this mass a vehicle "flies"
- `gravity`: px/s²
- `land_damage`: landing on a vehicle: impulse per px/s fall
- `tanker_blast`: impulse at the centre of a tanker blast
- `tanker_radius`: px
- `tanker_trigger`: impulse that lights a tanker's fuse
- `tanker_fuse`: s between the hit and the blast

---- Oil ----
- `oil_drop_gap`: px between drops along a leaking vehicle's slide
- `oil_radius`: px of one drop (the final pool is x2.3)
- `oil_max`: drops kept on the road
- `oil_spin`: rad/s of spin given on reaching oil
- `oil_grip`: x the slide friction while on oil
- `oil_time`: s the grip stays low after the last oil

---- The garage ----
- `engine_step`: + top speed and accel per engine level
- `engine_cost_1`: €
- `bullbar_time`: s you keep the wheel after the first impact
- `dynamite_blast`: impulse at the centre
- `dynamite_radius`: px
- `armor_cost`: € (needs the bull bar)
- `armor_time`: s of wheel added to the bull bar's
- `rocket_speed`: px/s
- `rocket_blast`: impulse at the centre
- `rocket_radius`: px
- `magnet_time`: s after the first impact
- `magnet_radius`: px
- `magnet_force`: px/s² pull
- `nitro_kick`: px/s added at once
- `nitro_time`: s of raised top speed
- `nitro_top`: x the boost top speed
- `oilcan_time`: s of oil laid behind you
- `jump_speed`: px/s up
- `insurance_bonus`: + on the final score
- `extratime_s`: s added to the countdown

---- Weather, events, replay ----
- `rain_grip`: x grip and braking in the rain
- `ice_grip`: x grip and braking on ice
- `event_progress`: the event fires when the car is this far from the junction (fraction of the street)
- `event_dist`: px from the junction where event vehicles appear
- `replay_slow`: x speed at the start of the replay
- `replay_fast`: x speed after that
- `replay_slow_time`: s of the pile-up shown slow

---- Vehicles you can drive (bought in the garage); the sports car uses mass_player ----
- `my_price_sport`: x the garage prices while you drive the sports car
- `my_speed_van`: x top speed
- `my_steer_van`: x turn rate
- `my_stars_van`: stars to unlock it
- `my_price_van`: x the garage prices while you drive it
- `my_stars_ambulance`: stars to unlock it
- `my_price_ambulance`: x the garage prices while you drive it
- `my_stars_truck`: stars to unlock it
- `my_price_truck`: x the garage prices while you drive it
- `my_stars_semi`: stars to unlock it
- `my_price_semi`: x the garage prices while you drive it
- `my_dmg_van`, `my_dmg_ambulance`, `my_dmg_truck`, `my_dmg_semi`: x the damage that scores while you drive it (the sports car: x1)
- `mass_trailer`: the semi's trailer
- `value_trailer`: only shown as dents, never scored

---- Sliding wrecks ----
- `skid_lateral`: /s sideways slide decay once loose
- `skid_forward`: /s rolling decay once loose
- `skid_brake`: px/s² constant scrub once loose
- `spin_damping`: /s

---- Traffic ----
- `traffic_brake`: px/s², low enough that they pile in
- `traffic_lookahead`: s ahead a driver watches
- `traffic_reaction`: s before a driver sees a wreck
- `wreck_brake`: x traffic_brake once the crash has started: drivers pile in
- `lane_width`: px

---- Ramp (level 3) ----
- `ramp_lift`: vz at take-off per px/s of speed
- `ramp_height`: px

---- Bonuses ----
- `bonus_points`: € per points pickup
- `mult_step`: added to the end multiplier

---- The run ----
- `approach_time`: s to reach the crossroads
- `intro_time`: s of flyover before the start
- `slowmo`: time scale right after the impact
- `slowmo_time`: s of slow motion (real time)
- `crash_countdown`: s from the first impact to the damage count
- `threshold_1`: € to clear level 1
- `threshold_2`: € to clear level 2
- `threshold_3`: € to clear level 3
- `threshold_4`: € to clear level 4
- `threshold_5`: € to clear level 5
- `threshold_6`: € to clear level 6
- `threshold_7`: € to clear level 7
- `threshold_8`: € to clear level 8
- `threshold_9`: € to clear level 9
- `threshold_10`: € to clear level 10
- `threshold_11`: € to clear level 11
- `threshold_12`: € to clear level 12
- `threshold_13`: € to clear level 13
- `threshold_14`: € to clear level 14
- `threshold_15`: € to clear level 15
- `threshold_16`: € to clear level 16
- `threshold_17`: € to clear level 17
- `threshold_18`: € to clear level 18
- `threshold_19`: € to clear level 19
- `star2`: x the objective for 2 stars, for a level with no `star2_N` (the daily)
- `star3`: x the objective for 3 stars, for a level with no `star3_N` (the daily)
- `star2_1` to `star2_19`: € for 2 stars on that level
- `star3_1` to `star3_19`: € for 3 stars on that level

The thresholds, 2- and 3-star scores, garage prices and `my_price_*` are worked out by
`tools/balance/propose.mjs --write` from the autopilot's runs (tools/balance/): 1 star passable
with the bare car, 3 stars at 90 % of the kit a player has three levels later, and everything for
every vehicle costing the 3-star sum of levels 1-15.
- `daily_base`: € per lane for the daily's objective
- `spawn_scale`: x on every lane's spawn gap

---- Camera and fake 3D ----
- `persp`: roof lean per px of height
- `persp_center_y`: where the view looks down from (0..1 of screen)
- `zoom_speed`: zoom out at top speed
- `touch_ui`: x size of the HUD and play buttons on a phone
- `touch_zoom`: x camera zoom on a phone (driving and crash)
- `look_ahead`: px the camera leads the car

## levels.json

The levels, one object a line, in play order (was `window.LEVELS` in the one-shot's config.js):
`name`, `lanes` (per direction), `approach` (px of street), `speedMul`, `mix` (traffic weights by kind),
`spawn` ([min, max] s between vehicles on a lane), `pickups` ([kind, x, y]), `ramp` ({from, len} px or false),
`rain`, `night`, `fog`, `ice`, `median`, `oilPatches`, `events` (convoy, chase, giant) and `challenges`
(destroy kind n · blasts n · hits n · score n, with a reward in € of garage credit, won once).

## Camera after the impact, tunnels

- `zoom_min_crash`: the furthest the camera zooms out to keep your car and the pile-up in view.
- `crash_frame_radius`: px from the first impact within which hit or loose vehicles count as the pile-up to frame.
- `crash_frame_pad`: px of margin round what the camera frames.
- `tunnel_mouth`: px past the boulevard's end (EXT) where each tunnel's mouth stands; your car and the wrecks stop there.
- `tunnel_depth`: px inside the tunnel where traffic appears.
- `tunnel_height`: px height of the embankment over each tunnel.

- `chase_lane_change`: /s how fast a car in the chase moves across to the lane it overtakes in.

## T-Rex, shops, cranes

- `trex_*`: the call of the Jurassic. `trex_cost` (€, x the vehicle's price factor), `trex_speed` px/s, `trex_step` s between footfalls,
  `trex_shake` screen shake a footfall, `trex_len`/`trex_width` px of its crushing footprint, `trex_push` px/s it throws vehicles aside,
  `trex_damage` € a second to each vehicle under its feet. It walks from the right-hand tunnel and stops at the middle (x = 0).
- `shop_share`: the share of the boulevard's front-row buildings that are shops (levels with `shops: true`).
- `shop_damage_k`: x the impact and blast damage a shop takes. `value_<shop>` € it is worth; `shop_w_<shop>` how often it appears.
- `lab_blast`, `lab_radius`: the laboratory's explosion when it is ruined.
- `crane_*`: a tower crane on a building site (levels with `cranes: n`). `crane_height`, `crane_jib` px; `crane_fall_accel` rad/s²
  of its fall; `crane_crush_width` px either side of its line; `crane_crush_damage` € to each vehicle under it; `crane_shop_damage`
  € to each shop it lands on; `crane_value` € the crane itself is worth.
- `eiffel_height`, `eiffel_crush_width`, `eiffel_crush_damage`, `eiffel_value`: the Eiffel Tower, France's
  crane (the first crane of each level in France): px tall (the length it falls across), px it
  crushes each side, € to each vehicle under it, € it is worth.

Old garage prices kept only to refund them: `nitro_cost`, `oilcan_cost`, `jump_cost`.

- `extratime2_cost`, `extratime2_s`: the second countdown upgrade (needs the first): € and s it adds.
- `trex_quake_radius`, `trex_quake_damage`: each T-Rex footfall shakes the shops within this many px of it, by this much at its feet, less further off (in the bakery's euros: see below). A crane in reach falls.
- Shop damage is counted on the bakery's scale (`value_boulangerie`): every shop loses the same share of itself to the same blow, and a dearer shop pays that share of its own value.

- `dynamite2_cost`, `dynamite2_extra`: Dynamite 2 (needs Dynamite): € and the extra charges a run.
- `rocket2_cost`, `rocket2_extra`: Roquette 2 (needs the launcher): € and the extra rockets a run.
- `trex_quake_car_radius`, `trex_quake_car_damage`, `trex_quake_push`: each footfall jolts the vehicles within this many px: € of damage and px/s of push at its feet, less further off; they leave their lane and become part of the pile-up.

- `vibe_crash`, `vibe_blast`, `vibe_step`: ms of vibration for your impact, a blast or a falling crane, and a T-Rex footfall (when the player has vibration on).
- `crash_band_margin`: px beyond the boulevard's sidewalks that still count as "on the boulevard" for the camera after the impact; the camera stays centred on the boulevard and fits its whole width.
- `touch_steer_top`, `touch_steer_h`: on a phone, where the steering buttons start and how tall they are (fractions of the screen height); the gadgets sit under them.
- `boot_time`: s the Android app shows its opening picture (assets/splash.png) before the title; a tap skips it.
- `boot_focus_y`: the height (0 top, 1 bottom) of the opening picture kept in the middle of a wide screen: the title and the crash.

## The angry farmers (France's gadget, key C)

- `farmers_cost`: € in the garage (the sports car's price; x my_price_* for the others)
- `farmers_speed`: px/s the convoy drives in from the left-hand tunnel
- `farmers_count`, `farmers_gap`: tractors in each row, px between them
- `farmers_rows`, `farmers_row_gap`: rows of tractors side by side, px between their middles
- `farmers_len`, `farmers_width`: px each tractor's footprint (what it shoves)
- `farmers_push`: px/s a vehicle is shoved sideways; `farmers_damage`: € a second to a vehicle in its path
- `farmers_bales`, `farmers_bale_every`: hay bales the last tractor drops, s between them
- `mass_hay`, `value_hay`: a hay bale's mass and value (it rolls into the traffic)

## The Jurassic combo (the T-Rex meets the farmers)

- `combo_bonus`: € added to the bonus when the T-Rex meets the convoy (once a run)
- `mass_farmtractor`, `value_farmtractor`: each tractor the T-Rex sends flying: its mass, and the € it scores as a wreck

## Performance limits

- `parts_max`: particles (smoke, fire, sparks, debris) on screen at most; new ones are skipped beyond it
- `floats_max`: floating texts (+€) at once; beyond it the oldest small ones go, the big banners stay
