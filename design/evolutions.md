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
