# Carambolage — Évolutions prévues

Idées discutées le 2026-11-20, à implémenter **après l'équilibrage en cours** (seuils par niveau et
prix du garage, mesurés par le pilote automatique de `tools/balance/`). Rien n'est encore construit.

Ordre retenu :
1. Finir l'équilibrage du jeu actuel.
2. Le mode Expert (il réutilise tout le contenu existant).
3. Un premier pays : **la France**. On mesure le temps qu'il demande avant de planifier les suivants.

## Règle de contenu : la classification d'âge

Le jeu vise **7 ans et plus** (PEGI 7 / questionnaire IARC de Google Play). Aujourd'hui, on ne percute
que des véhicules et des bâtiments, **aucun être humain ni animal**. On garde cette règle :

- pas d'animaux percutés (moutons, vaches…) : la classification monterait ;
- pas de personnes percutées (manifestants, cyclistes, piétons) : c'est pire encore (12 voire 16 ans) ;
- les lieux restent vides de monde (terrasse de café vide, etc.) ;
- humour bienveillant sur les clichés, jamais péjoratif.

## Les pays

Le joueur choisit une région ou un pays. À terme, plusieurs pays, chacun avec **une vingtaine de
niveaux, ses propres véhicules, gadgets et améliorations**, en rapport avec le pays.

- **Un menu en carte du monde**, avec les étoiles gagnées par pays.
- **Le gadget « T-Rex » change à chaque pays** : c'est le gadget signature du pays.
- **Une grue (à partir du niveau 10) est remplacée par un monument du pays**, qui tombe comme elle.
- La circulation, les événements surprise, les boutiques et la météo prennent la couleur du pays.
- Le pilote automatique (`tools/balance/`) mesure chaque nouveau pays de la même façon que le jeu actuel.

**À décider :** l'économie entre pays. Recommandation : **un garage et un argent par pays** (chaque pays
reste une vraie progression, plus simple à équilibrer), avec éventuellement un ou deux bonus qui
passent d'un pays à l'autre comme récompense de fidélité.

### La France (premier pays)

Retenu en priorité :

- **La tour Eiffel** remplace une grue à partir du niveau 10 : elle tombe en travers du boulevard.
  Attention : son image de jour est libre, mais **son illumination de nuit est protégée**. Sur les
  niveaux de nuit, la montrer éteinte ou stylisée.
- **Le convoi de tracteurs en colère** remplace le T-Rex : une colonne de tracteurs sort d'un tunnel,
  traverse le carrefour en bousculant tout et sème des bottes de foin qui roulent sur la chaussée.
  (C'est la version « manif » de l'idée, sans personne à percuter.)
- **La boule de pétanque géante** (gadget) : elle dévale le boulevard et fait un carreau dans les voitures.
- **Le rond-point** : certains niveaux remplacent le carrefour par un rond-point. La circulation tourne,
  les angles de choc changent, le carambolage se propage en cercle. Change le gameplay, pas que le décor.

En complément :

- **Circulation** (formes génériques, sans marques) : petite voiture ronde à toit en toile, citadine
  carrée des années 70, camionnette jaune du facteur, camion de boulangerie, scooters, tram,
  camping-cars et voitures chargées sur le toit.
- **Événements surprise** :
  - la caravane publicitaire du Tour (chars avec objets géants sur le toit : baguette, fromage),
    sans cyclistes ;
  - le chassé-croisé des vacances : circulation très dense ;
  - le mistral : un vent latéral pousse les véhicules.
- **Gadgets** : le bouchon de champagne (à la place de la roquette), la grève des feux (tous les feux
  passent au vert en même temps).
- **Boutiques destructibles** : la boulangerie existe déjà ; ajouter fromagerie, kiosque à journaux,
  café avec terrasse (vide).
- **Niveaux** : le périphérique, les Champs-Élysées, la Côte d'Azur, la montagne enneigée (le verglas
  existe), la Bretagne sous la pluie, le 14 Juillet de nuit avec feux d'artifice.

### Les pays suivants

Objectif : **au moins 5 pays** pour commencer, sur plusieurs continents (Europe, Asie, Amérique ;
Océanie et Afrique plus tard). Retenus avec la France : **Royaume-Uni, Japon, États-Unis, Brésil**,
et **l'Italie** pour la vague suivante.

Ordre conseillé après la France : **États-Unis et Japon** (plus gros marchés du Play Store, et leurs
mécaniques changent beaucoup le jeu), puis Royaume-Uni et Brésil, puis l'Italie.

Chaque fiche suit le modèle de la France, avec cinq ingrédients : circulation, monument (à la place
d'une grue), gadget signature (à la place du T-Rex), **une mécanique propre au pays**, et événements
ou météo. Garde-fous en plus de la règle de classification : pas de lieu religieux ni de mémorial,
pas d'image sensible (par exemple pas de gratte-ciel qui s'effondre à New York), et aucune marque,
licence ou personnage protégé.

#### Royaume-Uni (Europe)

- **Mécanique : la conduite à gauche.** Tout est inversé, réflexes du joueur compris.
- Circulation : bus à impériale rouges, taxis noirs, mini-citadines.
- Monument : la tour de Big Ben.
- Gadget signature : **le monstre du loch**, qui surgit du fleuve et balaie le boulevard (une créature
  légendaire qui frappe, comme le T-Rex ; le joueur ne percute pas d'animal).
- Événements : le brouillard de Londres (existe déjà), l'heure du thé (toute la circulation s'arrête
  net, puis repart en même temps).
- Boutiques : cabines téléphoniques rouges, pub, salon de thé.

#### Japon (Asie)

- **Mécanique : l'échangeur sur plusieurs étages** : des voies qui se croisent en hauteur, des
  véhicules qui tombent d'un niveau à l'autre.
- Circulation : mini-camions kei, taxis à portes automatiques, voitures cubiques, motos de livraison.
- Monument : la tour de Tokyo, rouge et blanche (écho à la tour Eiffel).
- Gadget signature : **un monstre géant (kaiju)** qui sort de la baie, traverse le carrefour comme le
  T-Rex et **crache un rayon** qui balaie le boulevard. Pour rester dans le genre sans toucher au
  personnage protégé de Toho (pas de royalties) :
  - un nom original, **jamais en « -zilla »** ;
  - une silhouette à nous, différente du T-Rex et de Godzilla (crête, queue en massue, couleurs vives) ;
  - un rayon qui s'éloigne de l'original : **pas bleu**, pas de plaques dorsales qui s'illuminent
    (par exemple vert acide ou violet, boule d'énergie ou souffle en spirale).
- Événements : le typhon (vent et pluie), le festival des lanternes de nuit.

#### États-Unis (Amérique)

- **Mécanique : les très larges boulevards** à 8 voies et beaucoup de véhicules lourds : le pays des
  records de dégâts.
- Circulation : taxis jaunes, bus scolaires, gros pick-ups, semi-remorques à long nez, camions de glaces.
- Monument : **les lettres géantes sur la colline** d'Hollywood, qui dévalent une par une.
- Gadget signature : **la tornade**, qui aspire et projette les voitures.
- Véhicule joueur : le monster truck.
- Événements : la course-poursuite (existe déjà), le défilé de chars.

#### Brésil (Amérique)

- **Mécanique : les rues en pente** de Rio : les épaves dévalent la colline, le carambolage continue
  tout seul en bas.
- Circulation : minibus colorés, motos-taxis, petites voitures.
- Monument : **le téléphérique du Pain de Sucre**, dont la cabine se décroche et roule (pas le Christ
  Rédempteur, lieu religieux).
- Gadget signature : **un char de carnaval géant** qui déboule (le char seul, sans danseurs).
- Événements : la pluie tropicale, le défilé de chars.

#### Italie (Europe, vague suivante)

- **Mécanique : les ruelles étroites.**
- Circulation : scooters, petites citadines rondes.
- Monument : **la tour de Pise, qui finit enfin par tomber.**
- Gadget signature : **le volcan**, qui projette des blocs de lave sur le boulevard.

## Le mode Expert (nom à trouver)

Deux modes : **Arcade** (le jeu actuel) et **Expert**. En Expert, déclencher un gadget lance un
**mini-défi** de quelques secondes au milieu de l'écran ; le gadget s'active selon le résultat.
But : plus de durée de vie, et du fun. S'inspirer du principe des micro-jeux très courts, avec notre
propre style.

Propositions faites (à valider) :

- **Pas de pause sèche** : le mini-défi se joue pendant un ralenti très appuyé, le carambolage visible
  en fond, pour garder la tension du moment fort.
- **Réussite graduée plutôt que tout ou rien** (idée initiale : raté = gadget consommé sans effet, ce
  qui risque de frustrer pour un gadget payé cher et à usage unique) :
  parfait = gadget renforcé, moyen = effet normal, raté = effet affaibli.
- **Jouable au doigt** sur téléphone en 2 à 3 secondes : taper au bon moment, glisser, tapoter vite.
- **Un défi lié à chaque gadget** : couper le bon fil (dynamite), aligner le viseur (roquette),
  rugir en rythme (T-Rex).
- **Étoiles et records séparés** pour le mode Expert, pour ne pas fausser les seuils de l'Arcade.

## Autres pistes

- Un **20ᵉ niveau** pour un compte rond (le jeu en a 19).
- Le **bouton « Effacer la sauvegarde »** des réglages (commit `09d673b`) : à garder ou non pour la
  version publiée, à décider.
