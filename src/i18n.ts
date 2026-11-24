// The game's languages. The game is written in French; every text it draws goes through
// text(), which calls tr(): in English, tr() finds the French sentence in EN (exact, then in
// capitals), or in PATTERNS for sentences with numbers or names in them, or splits a line on its
// " · " separators and translates each part. Anything not found stays in French, so a sentence
// missing here shows up untranslated rather than blank. Add a language: a new table like EN.

/** The languages the game speaks. */
export type Lang = 'fr' | 'en';

let lang: Lang = 'fr';
const cache = new Map<string, string>();

/** Switches the language; the next frame draws in it. */
export function setLang(l: Lang): void { lang = l; cache.clear(); }

/** The language in use. */
export function getLang(): Lang { return lang; }

/** The language a new player gets: the device's, French or English. */
export function defaultLang(): Lang {
  return /^fr\b/i.test(navigator.language || '') ? 'fr' : 'en';
}

/** French sentence -> English. */
const EN: Record<string, string> = {
  // title, controls
  'Flèches ou ZQSD : accélérer, freiner, tourner': 'Arrows or WASD: speed up, brake, steer',
  'Au premier choc, tu perds le contrôle !': 'First impact and you lose control!',
  'R : rejouer · P : pause · M : son · gadgets du garage : Espace, F, T, C': 'R: retry · P: pause · M: sound · garage gadgets: Space, F, T, C',
  'AGRICULTEURS PAS CONTENTS !': 'ANGRY FARMERS!', 'C : TRACTEURS': 'C: TRACTORS', 'TRACTEURS': 'TRACTORS',
  'Agriculteurs pas contents': 'Angry farmers', 'Botte de foin': 'Hay bale', 'Le monstre du loch': 'The loch monster', 'LE MONSTRE DU LOCH !': 'THE LOCH MONSTER!', "L'HEURE DU THÉ !": 'TEA TIME!', 'C : MONSTRE DU LOCH': 'C: LOCH MONSTER', 'MONSTRE': 'MONSTER',
  "C : un monstre surgit au milieu du carrefour et balaie le boulevard d'un tour de queue": 'C: a monster rises in the middle of the crossroads and sweeps the boulevard with one turn of its tail', 'Tracteur': 'Tractor',
  'C : des tracteurs déboulent par la gauche, bousculent tout et sèment du foin, sans toucher aux bâtiments':
    'C: tractors storm in from the left, shove everything aside and spill hay, leaving the buildings alone',
  'Un seul choc. Le plus gros carambolage possible.': 'One crash. The biggest pile-up you can make.',
  'Touches GAUCHE / DROITE : tourner (la voiture accélère seule)': 'LEFT / RIGHT buttons: steer (the car speeds up by itself)',
  'Gadgets sous les touches · REJOUER et MENU en bas à droite': 'Gadgets under the buttons · RETRY and MENU bottom right',
  'Entrée : jouer': 'Enter: play', 'Gauche / Droite ou molette : tourner la roue': 'Left / Right or wheel: turn the wheel',
  'O : réglages': 'O: settings', 'Verrouillé': 'Locked',
  // the countries
  'Berlinette': 'Coupé', 'Camionnette jaune': 'Yellow van', 'Camion du boulanger': "Baker's truck", 'Routier': 'Big rig',
  'CHOISIS TON PAYS': 'PICK YOUR COUNTRY',
  'avec une étoile': 'with a star',
  "La place de l'Étoile": 'Place de l\'Étoile', 'Arc de Triomphe': 'Arc de Triomphe', 'ARC DE TRIOMPHE': 'ARC DE TRIOMPHE',
  'Pub': 'Pub', 'PUB': 'PUB', 'Échoppe de ramen': 'Ramen bar', 'ÉCHOPPE DE RAMEN': 'RAMEN BAR', 'Magasin de jouets': 'Toy shop', 'MAGASIN DE JOUETS': 'TOY SHOP', 'Salon de thé': 'Tea room', 'SALON DE THÉ': 'TEA ROOM', 'Petite anglaise': 'Little British car', 'Fourgon rouge': 'Red van', 'Camion de livraison': 'Delivery lorry',
  // the United Kingdom's levels
  'Piccadilly': 'Piccadilly', 'Oxford Street': 'Oxford Street', 'Le pont de Londres': 'London Bridge', "L'heure de pointe à la City": 'Rush hour in the City',
  'Pluie sur Soho': 'Rain over Soho', 'Le convoi de Camden': 'The Camden convoy', 'Chaos à Trafalgar': 'Chaos at Trafalgar', 'Nuit à Westminster': 'Night at Westminster',
  'Le verglas de Hyde Park': 'Black ice in Hyde Park', 'Les coursiers de Brixton': 'The Brixton couriers', 'La petite rue de Notting Hill': 'The little Notting Hill street',
  'Brouillard sur la Tamise': 'Fog on the Thames', 'La M25': 'The M25', 'Tempête sur la Manche': 'Storm over the Channel', 'Les pompiers de Londres': "London's firefighters",
  'La M25 de nuit': 'The M25 by night', 'Le convoi de nuit': 'The night convoy', 'Blizzard sur les Highlands': 'Blizzard over the Highlands',
  'La relève de la garde': 'The changing of the guard', 'Le grand final royal': 'The royal grand finale',
  // Japan's levels
  'Shibuya': 'Shibuya', 'Shinjuku': 'Shinjuku', 'Le pont de la baie': 'The bay bridge', "L'heure de pointe à Tokyo": 'Rush hour in Tokyo',
  'Pluie sur Ginza': 'Rain over Ginza', "Le convoi d'Akihabara": 'The Akihabara convoy', "Les néons d'Akihabara": 'The neon lights of Akihabara',
  'Nuit à Roppongi': 'Night in Roppongi', "La neige d'Hokkaido": 'Snow on Hokkaido', "Les coursiers d'Asakusa": 'The Asakusa couriers',
  'La petite rue de Kyoto': 'The little Kyoto street', 'Brouillard sur la baie de Tokyo': 'Fog over Tokyo Bay', "L'autoroute de Tokyo": 'The Tokyo expressway',
  'Typhon sur Okinawa': 'Typhoon over Okinawa', 'Les pompiers de Yokohama': "Yokohama's firefighters", "L'échangeur de nuit": 'The interchange by night',
  'Le convoi de Nagoya': 'The Nagoya convoy', 'Blizzard au pied du Fuji': 'Blizzard below Mount Fuji', "Le grand échangeur d'Osaka": 'The great Osaka interchange',
  'Le grand final de Tokyo': 'The Tokyo grand finale', 'CHUTE !': 'FALL!',
  'Times Square': 'Times Square',
  'Le Bronx': 'The Bronx',
  'Le pont de Brooklyn': 'Brooklyn Bridge',
  "L'heure de pointe à Chicago": 'Chicago rush hour',
  'Pluie sur Seattle': 'Rain over Seattle',
  'Le convoi du Texas': 'The Texas convoy',
  'Les néons de Las Vegas': 'Las Vegas neon',
  'Nuit à La Nouvelle-Orléans': 'Night in New Orleans',
  'La neige de Denver': 'Denver snow',
  'Les coursiers de San Francisco': 'San Francisco couriers',
  'La petite rue de Boston': 'The little Boston street',
  'Brouillard sur la baie de San Francisco': 'Fog over San Francisco Bay',
  "L'autoroute de Los Angeles": 'The Los Angeles freeway',
  'Orage sur Miami': 'Storm over Miami',
  'Les pompiers de Detroit': 'The Detroit firefighters',
  'La Route 66 de nuit': 'Route 66 by night',
  'Le convoi de Nashville': 'The Nashville convoy',
  'Blizzard dans le Montana': 'Montana blizzard',
  "Le grand carrefour d'Atlanta": 'The great Atlanta crossroads',
  'Le grand final de New York': 'The New York grand finale',
  'TORNADE !': 'TORNADO!',
  'C : TORNADE': 'C: TORNADO',
  'TORNADE': 'TORNADO',
  'La tornade': 'The tornado',
  "LE T-REX S'ENVOLE !": 'THE T-REX TAKES OFF!',
  'C : une tornade arrive par la gauche, aspire les véhicules, les fait tourner et les projette au loin': 'C: a tornado comes in from the left, sucks the vehicles up, spins them round and flings them far away',
  'Diner': 'Diner',
  'DINER': 'DINER',
  'Boutique de donuts': 'Donut shop',
  'BOUTIQUE DE DONUTS': 'DONUT SHOP',
  'Station-service': 'Gas station',
  'STATION-SERVICE': 'GAS STATION',
 'KAMINARI-GO !': 'KAMINARI-GO!', 'C : KAMINARI-GO': 'C: KAMINARI-GO', 'MÉCA': 'MECHA', 'COMBAT DE GÉANTS !': 'CLASH OF THE GIANTS!', 'HAKKEYOI !': 'HAKKEYOI!',
  'C : un robot géant arrive par la gauche, tape du pied au milieu du carrefour et pousse les véhicules vers les avenues du dessous': 'C: a giant robot walks in from the left, stamps in the middle of the crossroads and shoves the traffic down to the avenues below', 'France': 'France', 'Royaume-Uni': 'United Kingdom', 'Japon': 'Japan',
  'États-Unis': 'United States', 'Brésil': 'Brazil', 'BIENTÔT': 'SOON', 'Bientôt disponible !': 'Coming soon!',
  'Entrée ou clic : choisir': 'Enter or click: choose', 'Gauche / Droite : changer de pays': 'Left / Right: change country',
  'JOUER': 'PLAY', 'PLEIN ÉCRAN': 'FULL SCREEN',
  'PLEIN ÉCRAN SUR IPHONE': 'FULL SCREEN ON IPHONE', 'Safari ne permet pas le plein écran à une page web.': "Safari doesn't let a web page go full screen.",
  "Ajoute le jeu à l'écran d'accueil :": 'Add the game to your Home Screen:', '1. Touche Partager': '1. Tap Share',
  "2. Choisis « Sur l'écran d'accueil »": '2. Choose "Add to Home Screen"',
  "3. Ouvre Carambolage depuis l'écran d'accueil : il sera en plein écran": '3. Open Carambolage from the Home Screen: it plays full screen',
  'Touche pour fermer': 'Tap to close', 'RÉGLAGES': 'SETTINGS', "Tourne ton téléphone à l'horizontale": 'Turn your phone sideways',
  // settings
  'Son': 'Sound', 'Activé': 'On', 'Désactivé': 'Off', 'Vibrations': 'Vibration', 'Activées': 'On', 'Désactivées': 'Off',
  'Langue': 'Language', 'Français': 'Français', 'English': 'English',
  "Sur les téléphones Android et dans l'appli": 'On Android phones and in the app',
  'Entrée ou Gauche / Droite : changer': 'Enter or Left / Right: change',
  'Clic ou Entrée : changer': 'Click or Enter: change', 'Haut / Bas : choisir': 'Up / Down: choose',
  'Échap : retour': 'Esc: back', 'RETOUR': 'BACK',
  'Sauvegarde': 'Save', 'Effacer': 'Erase', 'Effacer les scores, le garage et les niveaux': 'Erase the scores, the garage and the levels',
  'EFFACER LA SAUVEGARDE ?': 'ERASE THE SAVE?', 'OUI': 'YES', 'NON': 'NO', 'Sauvegarde effacée': 'Save erased',
  'Tu perdras tous tes scores, tes étoiles, tes niveaux débloqués,': 'You will lose all your scores, your stars, your unlocked levels,',
  'ton garage et tes défis. Tu repartiras de zéro.': 'your garage and your challenges. You will start from zero.',
  'Impossible de revenir en arrière.': 'This cannot be undone.',
  // levels
  'Le carrefour': 'The Crossroads', 'Le boulevard': 'The Boulevard', 'Le tremplin': 'The Ramp', "L'heure de pointe": 'Rush Hour',
  'Le convoi': 'The Convoy', 'Le grand chaos': 'Total Chaos', 'Sous la pluie': 'In the Rain', 'Nuit noire': 'Pitch Black',
  "L'autoroute": 'The Motorway', 'Brouillard': 'Fog', 'Verglas': 'Black Ice', 'La rue courte': 'The Short Street',
  'Convoi de nuit': 'Night Convoy', 'Tempête': 'Storm', 'Les motards': 'The Bikers', 'Pompiers en folie': 'Fire Engine Frenzy',
  'Autoroute de nuit': 'Night Motorway', 'Blizzard': 'Blizzard', 'Le grand final': 'The Grand Finale', 'Carambolage du jour': 'Daily Pile-up',
  'pluie': 'rain', 'nuit': 'night', 'brouillard': 'fog', 'verglas': 'ice', 'autoroute': 'motorway', 'tremplin': 'ramp',
  'route mouillée, ça glisse': 'wet road, it slides', 'de nuit': 'at night', 'barrière centrale': 'central barrier',
  // vehicles, shops, figures
  'Ta voiture': 'Your car', 'Voiture': 'Car', 'Taxi': 'Taxi', 'Moto': 'Motorbike', 'Police': 'Police', 'Ambulance': 'Ambulance',
  'Pompiers': 'Fire engine', 'Remorque': 'Trailer', 'Bus': 'Bus', 'Camion': 'Truck', 'Camion-citerne': 'Tanker', 'Convoi': 'Convoy',
  'Citerne géante': 'Giant tanker', 'T-Rex': 'T-Rex', 'Roquette': 'Rocket', 'En feu': 'On fire', 'À toi :': 'Yours:',
  'Tout équipée': 'Fully geared', 'Équipée': 'Geared', 'Bonus': 'Bonus', 'Garage': 'Garage',
  'Sportive': 'Sports car', 'Van': 'Van', 'Semi-remorque': 'Semi-trailer', 'Monster truck': 'Monster truck', 'Petite sportive': 'Little sports car', 'Mini-van': 'Minivan', 'Muscle car': 'Muscle car', 'Poids lourd': 'Big truck',
  "roule sur les petites voitures et les écrase sans s'arrêter": 'drives over the small cars and crushes them without stopping', 'ÉCRASÉE !': 'CRUSHED!',
  'Boulangerie': 'Bakery', 'Boucherie': 'Butcher', 'Bijouterie': 'Jeweller', 'Banque': 'Bank', 'Laboratoire': 'Laboratory',
  // in play
  'BOUM !': 'BOOM!', 'CONVOI EXCEPTIONNEL !': 'OVERSIZE CONVOY!', 'COURSE-POURSUITE !': 'POLICE CHASE!', 'CITERNE GÉANTE !': 'GIANT TANKER!',
  'DYNAMITE !': 'DYNAMITE!', 'APPEL DU JURASSIQUE !': 'JURASSIC CALL!', 'TURBO !': 'TURBO!', 'CARAMBOLAGE !': 'PILE-UP!',
  'DÉGÂTS': 'DAMAGE', 'VITESSE': 'SPEED', 'TURBO': 'TURBO', 'VÉHICULES TOUCHÉS': 'VEHICLES HIT', 'DÉFIS': 'CHALLENGES',
  'COMPTE À REBOURS': 'COUNTDOWN', 'CARREFOUR': 'CROSSROADS', 'PAUSE': 'PAUSE', 'P pour reprendre': 'P to resume',
  'T : APPEL DU JURASSIQUE': 'T: JURASSIC CALL', 'GAUCHE': 'LEFT', 'DROITE': 'RIGHT', 'REJOUER': 'RETRY', 'MENU': 'MENU',
  'T-REX': 'T-REX', 'REPRENDRE': 'RESUME',
  // the end of a run, the replay
  'Temps écoulé': 'Time up', 'Fin du compte à rebours': 'Countdown over', 'TROIS ÉTOILES !': 'THREE STARS!',
  'OBJECTIF ATTEINT !': 'GOAL REACHED!', 'NIVEAU RÉUSSI !': 'LEVEL CLEARED!', 'Pas assez de dégâts': 'Not enough damage',
  'Dégâts': 'Damage', 'Véhicules touchés': 'Vehicles hit', 'Multiplicateur': 'Multiplier', 'SCORE': 'SCORE',
  'déjà réussi': 'already done', 'raté': 'missed', 'Entrée : réessayer': 'Enter: try again', 'Entrée : niveau suivant': 'Enter: next level',
  'Tous les niveaux réussis ! Entrée : menu': 'All levels cleared! Enter: menu', 'R : rejouer': 'R: retry',
  'V : revoir le replay': 'V: watch the replay', 'Échap : menu': 'Esc: menu', 'RÉESSAYER': 'TRY AGAIN', 'NIVEAU SUIVANT': 'NEXT LEVEL',
  'REPLAY': 'REPLAY', 'RALENTI': 'SLOW MOTION', 'ACCÉLÉRÉ': 'FAST FORWARD', 'Entrée : passer': 'Enter: skip', 'PASSER': 'SKIP',
  // the garage
  'LE GARAGE': 'THE GARAGE', 'AMÉLIORATIONS': 'UPGRADES', 'GADGETS': 'GADGETS', 'VÉHICULES': 'VEHICLES',
  'Moteur': 'Engine', 'Pare-buffle': 'Bull bar', 'Carrosserie renforcée': 'Armoured body', 'Compte à rebours +': 'Countdown +',
  'Compte à rebours 2+': 'Countdown 2+', 'Assurance tous risques': 'Full insurance', 'Aimant à épaves': 'Wreck magnet',
  'Dynamite': 'Dynamite', 'Dynamite 2': 'Dynamite 2', 'Lance-roquettes': 'Rocket launcher', 'Roquette 2': 'Rocket 2',
  'Appel du jurassique': 'Jurassic call',
  'ESPACE : ta voiture explose et souffle tout autour (une fois par course)': 'SPACE: your car explodes and blasts everything round it (once a run)',
  'T : un T-Rex traverse le boulevard, écrase les véhicules et ébranle les commerces (lance le compte à rebours)':
    'T: a T-Rex crosses the boulevard, crushing vehicles and shaking the shops (starts the countdown)',
  'légère et vive': 'light and lively', 'un peu plus lourd': 'a little heavier', 'avec gyrophare': 'with a siren light',
  'lourd : il pousse fort': 'heavy: it shoves hard', 'la remorque balaie tout en portefeuille': 'the trailer jackknifes and sweeps everything',
  'INSTALLÉ': 'INSTALLED', 'AU VOLANT': 'DRIVING', 'CHOISIR': 'CHOOSE', 'DÉBLOQUER': 'UNLOCK',
  'Touche encore pour valider': 'Tap again to confirm', 'Déjà au maximum': 'Already at the maximum',
  'Pas assez de crédit : fais plus de dégâts !': 'Not enough credit: cause more damage!',
  'Gauche / Droite : onglet': 'Left / Right: tab', 'Entrée : acheter, débloquer ou prendre le volant': 'Enter: buy, unlock or take the wheel',
};

/** The same table in capitals, for the texts the game draws upper-cased (CARAMBOLAGE DU JOUR, LE CARREFOUR). */
const UP: Record<string, string> = {};
for (const k of Object.keys(EN)) UP[k.toUpperCase()] = EN[k].toUpperCase();

/** French nouns of the challenges -> English. */
const NOUN: Record<string, string> = {
  voiture: 'car', voitures: 'cars', taxi: 'taxi', taxis: 'taxis', moto: 'motorbike', motos: 'motorbikes', bus: 'bus', camion: 'truck',
  camions: 'trucks', citerne: 'tanker', citernes: 'tankers', 'voiture de police': 'police car', 'voitures de police': 'police cars',
  ambulance: 'ambulance', ambulances: 'ambulances', 'camion de pompiers': 'fire engine', 'camions de pompiers': 'fire engines',
};

type Rule = [RegExp, (m: RegExpMatchArray) => string];
/** Sentences with numbers or names in them. */
const PATTERNS: Rule[] = [
  [/^Niveau (\d+) de (.+)$/, m => `${tr(m[2])}'s level ${m[1]}`],
  [/^Finis le niveau (\d+) de (.+) avec au moins une étoile$/, m => `Finish ${tr(m[2])}'s level ${m[1]} with at least one star`],
  [/^(\d+) niveaux$/, m => `${m[1]} levels`],
  [/^NIVEAU (\d+)$/, m => `LEVEL ${m[1]}`],
  [/^NIVEAU (\d+) — (.+)$/, m => `LEVEL ${m[1]} — ${tr(m[2])}`],
  [/^Objectif ([^·]+)$/, m => `Goal ${m[1]}`],
  [/^Record ([^·]+)$/, m => `Best ${m[1]}`],
  [/^Meilleur (.+?)(   NOUVEAU RECORD !)?$/, m => `Best ${m[1]}${m[2] ? '   NEW RECORD!' : ''}`],
  [/^(\d) étoiles ([^·]+)$/, m => `${m[1]} stars ${m[2]}`],
  [/^(\d+) étoiles sur (\d+)$/, m => `${m[1]} stars of ${m[2]}`],
  [/^(\d+) ÉTOILES$/, m => `${m[1]} STARS`],
  [/^U : garage \(crédit (.+)\)$/, m => `U: garage (credit ${m[1]})`],
  [/^D : carambolage du jour \(record (.+)\)$/, m => `D: daily pile-up (best ${m[1]})`],
  [/^Verrouillé : réussis d'abord le niveau (\d+)$/, m => `Locked: clear level ${m[1]} first`],
  [/^Détruis (\d+) (.+)$/, m => `Destroy ${m[1]} ${m[2] === 'bus' && m[1] !== '1' ? 'buses' : NOUN[m[2]] || m[2]}`],
  [/^Fais sauter (\d+) citernes?$/, m => `Blow up ${m[1]} tanker${m[1] === '1' ? '' : 's'}`],
  [/^Touche (\d+) véhicules$/, m => `Hit ${m[1]} vehicles`],
  [/^Score de ([^·]+)$/, m => `Score ${m[1]}`],
  [/^\+(.+) \(réussi\)$/, m => `+${m[1]} (done)`],
  [/^DÉFI RÉUSSI \+(.+)$/, m => `CHALLENGE DONE +${m[1]}`],
  [/^ÉVÉNEMENT : (.+)$/, m => `EVENT: ${tr(m[1])}`],
  [/^ESPACE : DYNAMITE ×(\d+)$/, m => `SPACE: DYNAMITE ×${m[1]}`],
  [/^F : ROQUETTE ×(\d+)$/, m => `F: ROCKET ×${m[1]}`],
  [/^ROQUETTE (\d+)$/, m => `ROCKET ${m[1]}`],
  [/^VOLANT : (.+) s$/, m => `WHEEL: ${m[1]} s`],
  [/^AIMANT : (.+) s$/, m => `MAGNET: ${m[1]} s`],
  [/^(.+) DÉTRUITE !$/, m => `${tr(m[1])} DESTROYED!`],
  [/^(.+) DÉTRUIT !$/, m => `${tr(m[1])} DESTROYED!`],
  [/^LA GRUE ! \+(.+)$/, m => `THE CRANE! +${m[1]}`],
  [/^LA TOUR EIFFEL ! \+(.+)$/, m => `THE EIFFEL TOWER! +${m[1]}`],
  [/^LA PAGODE ! \+(.+)$/, m => `THE PAGODA! +${m[1]}`],
  [/^LA STATUE DE LA LIBERTÉ ! \+(.+)$/, m => `THE STATUE OF LIBERTY! +${m[1]}`],
  [/^T-REX VOLANT ! \+(.+)$/, m => `FLYING T-REX! +${m[1]}`],
  [/^WAGON-CITERNE ! \+(.+)$/, m => `TANK WAGON! +${m[1]}`],
  [/^BIG BEN ! \+(.+)$/, m => `BIG BEN! +${m[1]}`],
  [/^COMBO JURASSIQUE ! \+(.+)$/, m => `JURASSIC COMBO! +${m[1]}`],
  [/^LE T-REX GAGNE ! \+(.+)$/, m => `THE T-REX WINS! +${m[1]}`],
  [/^KAMINARI-GO GAGNE ! \+(.+)$/, m => `KAMINARI-GO WINS! +${m[1]}`],
  [/^×(\S+)   assurance ×(.+)$/, m => `×${m[1]}   insurance ×${m[2]}`],
  [/^Carambolage du jour : le record d'aujourd'hui \((.+)\) compte dans ton crédit$/, m => `Daily pile-up: today's best (${m[1]}) counts in your credit`],
  [/^Crédit pour le garage : (.+)$/, m => `Garage credit: ${m[1]}`],
  [/^Crédit : ([^·]+)$/, m => `Credit: ${m[1]}`],
  [/^Pour ton véhicule au volant : (.+) · prix ×(.+) · un autre véhicule repart de zéro$/, m => `For the vehicle at the wheel: ${tr(m[1])} · prices ×${m[2]} · another vehicle starts from nothing`],
  [/^Les véhicules se débloquent avec tes étoiles : tu en as (\d+) sur (\d+)$/, m => `Vehicles unlock with your stars: you have ${m[1]} of ${m[2]}`],
  [/^(.+) REQUIS$/, m => `${tr(m[1])} NEEDED`],
  [/^Il faut d'abord : (.+)$/, m => `You need first: ${tr(m[1])}`],
  [/^(.+) installé !$/, m => `${tr(m[1])} installed!`],
  [/^(.+) : c'est parti !$/, m => `${tr(m[1])}: let's go!`],
  [/^(.+) débloqué !$/, m => `${tr(m[1])} unlocked!`],
  [/^Il te faut (\d+) étoiles pour ce véhicule \(tu en as (\d+)\)$/, m => `You need ${m[1]} stars for this vehicle (you have ${m[2]})`],
  [/^Dégâts ×(\S+) · poids (\S+) · vitesse ×(\S+) · virage ×(\S+) · (.+?)(?: · (\d+) équipements?)?$/, m =>
    `Damage ×${m[1]} · weight ${m[2]} · speed ×${m[3]} · steering ×${m[4]} · ${tr(m[5])}${m[6] !== undefined ? ` · ${m[6]} item${m[6] === '1' ? '' : 's'}` : ''}`],
  [/^\+(\d+) % de vitesse et d'accélération par niveau \(niveau (\d+)\/(\d+)\)$/, m => `+${m[1]}% speed and acceleration a level (level ${m[2]}/${m[3]})`],
  [/^Tu gardes le volant (\S+) s après le premier choc$/, m => `You keep the wheel ${m[1]} s after the first impact`],
  [/^\+(\S+) s de volant après le premier choc, en plus du pare-buffle$/, m => `+${m[1]} s at the wheel after the first impact, on top of the bull bar`],
  [/^\+(\d+) charge de dynamite : une explosion de plus par course$/, m => `+${m[1]} dynamite charge: one more explosion a run`],
  [/^\+(\S+) s au compte à rebours du carambolage$/, m => `+${m[1]} s on the pile-up countdown`],
  [/^encore \+(\S+) s au compte à rebours, après « Compte à rebours \+ »$/, m => `another +${m[1]} s on the countdown, after "Countdown +"`],
  [/^\+(\d+) % sur le score final de chaque course$/, m => `+${m[1]}% on the final score of every run`],
  [/^(\S+) s après le choc, ta voiture attire les véhicules proches$/, m => `For ${m[1]} s after the impact, your car pulls in the vehicles nearby`],
  [/^F : une roquette droit devant fait exploser ce qu'elle touche \((\d+) par course\)$/, m => `F: a rocket straight ahead blows up what it hits (${m[1]} a run)`],
  [/^\+(\d+) roquettes par course$/, m => `+${m[1]} rockets a run`],
];

function translate(s: string): string {
  if (EN[s] !== undefined) return EN[s];
  if (UP[s] !== undefined) return UP[s];
  for (const [re, f] of PATTERNS) { const m = s.match(re); if (m) return f(m); }
  const parts = s.split(/(\s+·\s+)/);
  if (parts.length > 1) return parts.map((p, i) => (i % 2 ? p : translate(p))).join('');
  const t = s.trim();
  if (t && t !== s) return s.replace(t, translate(t));
  return s;
}

/** A text in the language in use (the French source when the language is French, or nothing matches). */
export function tr(s: string): string {
  if (lang === 'fr' || !s) return s;
  const hit = cache.get(s);
  if (hit !== undefined) return hit;
  const out = translate(s);
  if (cache.size < 5000) cache.set(s, out);
  return out;
}
