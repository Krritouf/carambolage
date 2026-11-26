# Carambolage — Évolutions prévues

Idées discutées le 2026-11-20, à implémenter **après l'équilibrage en cours** (seuils par niveau et
prix du garage, mesurés par le pilote automatique de `tools/balance/`). Rien n'est encore construit.

Ordre retenu :
1. Finir l'équilibrage du jeu actuel.
2. Le mode Casse-cou (il réutilise tout le contenu existant).
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
  **Fait (2026-11-20)** : deux rangées de cinq tracteurs, touche C, en plus du T-Rex.
- **Le combo jurassique** : si le T-Rex et le cortège se rencontrent, le T-Rex rugit et envoie valser
  les tracteurs (épaves qui comptent au score), plus un bonus « COMBO JURASSIQUE ! » (`combo_bonus`).
  Idée à reprendre pour chaque pays : le gadget du pays a un combo avec le T-Rex.
- **La boule de pétanque géante** (gadget) : elle dévale le boulevard et fait un carreau dans les voitures.
- **Le rond-point** — **fait (2026-11-20)** : le niveau 20 de France, la place de l'Étoile, avec l'Arc de Triomphe
  sur l'îlot (destructible, gros bonus). Spécialité française (pas au Royaume-Uni). Idée d'origine :
  certains niveaux remplacent le carrefour par un rond-point.
  **À faire plus tard** (demandé le 2026-11-20) : passer aussi en rond-point quelques autres niveaux de France
  (leurs seuils seront à remesurer). La circulation tourne,
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

**Fait (2026-11-20)** : ouvert quand le niveau 19 de France a au moins 1 étoile ; sa propre progression
(argent, garage, véhicules, étoiles : tout repart de zéro) ; 20 niveaux qui suivent la courbe de la France,
seuils repris de la France en attendant le pilote automatique ; conduite à gauche ; bus à impériale, taxis
noirs, police et ambulance à damier, pub et salon de thé ; Big Ben ; le monstre du loch (touche C, il surgit
au milieu du carrefour et balaie un tour complet) ; l'heure du thé (dès le niveau 4). À faire : un combo
avec le T-Rex, et mesurer les seuils.

- **Mécanique : la conduite à gauche.** Tout est inversé, réflexes du joueur compris.
- Circulation : bus à impériale rouges, taxis noirs, mini-citadines.
- Monument : la tour de Big Ben.
- Gadget signature : **le monstre du loch**, qui surgit du fleuve et balaie le boulevard (une créature
  légendaire qui frappe, comme le T-Rex ; le joueur ne percute pas d'animal).
- Événements : le brouillard de Londres (existe déjà), l'heure du thé (toute la circulation s'arrête
  net, puis repart en même temps).
- Boutiques : cabines téléphoniques rouges, pub, salon de thé.

#### Japon (Asie)

**En cours (2026-11-24)** : ouvert quand le niveau 20 du Royaume-Uni a au moins 1 étoile ; sa propre
progression ; conduite à gauche ; le yen ; 20 niveaux (seuils repris du Royaume-Uni en attendant le pilote
automatique). L'échangeur est fait : une avenue en contrebas (−120) au nord dès le niveau 1, une seconde au sud
sous la rue d'arrivée (un pont) dès le niveau 7, une avenue plus profonde encore (−210) derrière la première dès
le niveau 15. Un parapet casse sous un choc fort (`rail_break`), le véhicule tombe et le carambolage continue en
bas ; la voiture du joueur peut tomber aussi.
Fait aussi (2026-11-24) : le gadget **Kaminari-Go** (C, à la place du kaiju), un robot de chantier géant façon
sumo : il arrive par la gauche de l'écran, tape du pied deux fois au milieu du carrefour (les voitures sautent, les
parapets proches cassent, tout tombe dans les avenues), repousse les véhicules des deux paumes vers les côtés, puis
repart. **Le combat de géants** : s'il croise le T-Rex, combat de sumo (face-à-face, corps à corps, l'un renverse
l'autre, vainqueur tiré au sort), onde de choc, prime `sumo_bonus`, puis chacun rentre par où il est venu ; le
compte à rebours attend la fin du combat. **La pagode** à 5 étages remplace la première grue (comme Big Ben), et
deux boutiques japonaises, l'échoppe de ramen et le magasin de jouets (capsules), remplacent le pub et le salon de
thé. **Le yen** : tous les montants restent comptés en euros et s'affichent au taux du pays (`jp_rate` = 175 ;
`uk_rate` = 1, la livre étant proche de l'euro) : dégâts, bonus, crédit, prix du garage, objectifs. Les objectifs
d'étoiles et les prix du garage sont arrondis à 3 chiffres significatifs dans la monnaie du pays (au moins au
millier), pour des cibles rondes. **Les véhicules japonais** (2026-11-24) : la voiture cubique, le mini-camion kei
(cageots de légumes), la voiture ordinaire (un tiers chacune), le taxi vert au lumignon et aux rétroviseurs sur les ailes,
la police noir et blanc, le scooter de livraison au coffre rouge, le bus de ville blanc à bande verte, le camion à
cabine plate et caisse alu. **Le typhon** (niveaux 14 et 19, `typhoon`) : le vent souffle le long du boulevard par
rafales (« RAFALE ! », `typhoon_gust_every`, `typhoon_gust_time`) ; il pousse les épaves, et plus fort ce qui est en l'air
(`typhoon_push`), fait dériver ta voiture (`typhoon_player`), couche la fumée et les flammes, emporte feuilles et bouts de
toit ; la pluie bat en biais. **Le festival des lanternes** (niveaux de nuit 8, 16 et 20, `lanterns`) : deux guirlandes de
lanternes en papier de chaque côté du carrefour, tendues d'un trottoir à l'autre, qui éclairent la route ; la circulation
passe dessous, mais un véhicule projeté, le T-Rex, Kaminari-Go ou la tornade arrache la guirlande : toutes ses lanternes
tombent, brûlent un peu et rapportent `value_lantern` chacune (« LANTERNES ! »).

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

**En cours (2026-11-24)** : ouverts quand le niveau 20 du Japon a au moins 1 étoile ; le dollar (`us_rate` = 1) ;
20 niveaux (`data/levels-us.json`, seuils repris du Japon en attendant le pilote automatique). Faits :
- **le passage à niveau** (choisi à la place des seuls boulevards larges) : une voie ferrée traverse le boulevard
  (niveaux 1 à 6 : une, à x = 480 ; 7 à 14 : deux ; 15 à 20 : deux, dont une double avec un train dans chaque sens).
  Cloches, barrières qui se baissent, la circulation attend avant la voie, puis un long train de marchandises
  (locomotive, conteneurs sur deux étages, trémies, wagons-citernes). Ce que le carambolage jette sur la voie est
  balayé ; un wagon-citerne pris dans une explosion ou heurté fort saute (`train_tank_value`), et ses voisins après lui ;
- **la tornade** (C) : arrive par la gauche de l'écran, aspire, fait tourner en montant et projette les véhicules,
  arrache les toits des boutiques, ciel assombri ; **le T-Rex volant** : la tornade avale le T-Rex, le fait tourner
  en l'air et le lâche au milieu du carrefour (onde de choc, prime `twister_bonus`), puis il repart, étourdi ;
- **la statue de la Liberté** à la place de la première grue (les lettres d'Hollywood sont une marque déposée) ;
- les boutiques : diner, boutique de donuts, station-service (qui explose comme le labo, qu'elle remplace).
**Les véhicules américains** (2026-11-24) : pick-up, SUV et voiture ordinaire (un tiers chacun), taxi jaune à damier,
police noir et blanc à pare-buffle, bus scolaire jaune à long nez, semi-remorque à long nez et cheminées chromées, camion
de glaces (un camion sur deux). **Le monster truck** (garage, États-Unis seulement, `my_*_monster`, 20 étoiles) : roule
sur les voitures, taxis, motos et voitures de police à plus de `monster_crush_speed` et les écrase (`monster_crush_damage`
de leur valeur, traces de pneus, « ÉCRASÉE ! »), rebondit (`monster_hop`) et **garde le volant** ; un véhicule plus lourd
ou un mur l'arrête comme les autres. **L'alerte tornade** (événement `alert`, niveaux 13, 14 (seul événement), 19
et 20) : sirènes, ciel qui s'assombrit, puis `alert_delay` s après l'alerte, une fois le carambolage lancé, une tornade
touche le sol à droite de l'écran et traverse le boulevard de droite à gauche (ta tornade attend qu'elle soit partie).
**La parade** (événement `parade`, niveaux 7, 11, 17 et 20) : quatre chars avancent lentement sur une voie, l'un derrière
l'autre (étoile dorée géante, gâteau d'anniversaire, fusée, ballon rayé), `value_float` chacun ; détruit, un char
explose en confettis.

- **Mécanique : les très larges boulevards** à 8 voies et beaucoup de véhicules lourds : le pays des
  records de dégâts.
- Circulation : taxis jaunes, bus scolaires, gros pick-ups, semi-remorques à long nez, camions de glaces.
- Monument : **les lettres géantes sur la colline** d'Hollywood, qui dévalent une par une.
- Gadget signature : **la tornade**, qui aspire et projette les voitures.
- Véhicule joueur : le monster truck.
- Événements : la course-poursuite (existe déjà), le défilé de chars.

#### Brésil (Amérique)

**Fait (2026-11-24)** : ouvert quand le niveau 20 des États-Unis a au moins 1 étoile ; le réal (`br_rate` = 6) ;
20 niveaux (`data/levels-br.json`, seuils repris des États-Unis en attendant le pilote automatique). Faits :
- **les rues en pente** (niveaux 2, 5, 8, 11, 14, 17 et 20, `slope` = 1 ou -1, le sens de la descente) : panneaux et
  chevrons sur la chaussée ; la circulation tient sa voie, mais ce qui est lâché (épaves, ta voiture hors de contrôle)
  accroche moins (`slope_grip`) et dévale (`slope_accel`) : le carambolage continue tout seul plus bas ;
- **le téléphérique** à la place de la première grue : un pylône d'acier, son câble et sa cabine rouge ; il tombe comme
  un monument (`teleferique_*`), puis la cabine se décroche et dévale le boulevard (`cabin_push`, `value_cabin`) ;
- **le char de carnaval** (C, gadget du Brésil) : arrive par la gauche, batucada, plumes, soleil géant, écrase tout
  (`carnaval_*`) et sème des confettis ; **le T-Rex fait le carnaval** : s'il croise le char, il monte dessus, danse
  (prime `carnaval_bonus`) et repart avec lui ;
- **la parade** (niveaux 7, 10, 13 et 20) avec des chars de carnaval : éventail de plumes, masque, soleil, ananas ;
- les boutiques : bar à jus et boutique de tongs (à la place de la boulangerie et de la boucherie) ;
- les véhicules : minibus, petite citadine, taxi jaune à bande bleue, police blanche et bleue, moto-taxi avec son
  passager, bus de ville blanc, camion bariolé à bâche rayée ; au garage, le minibus et le camion bariolé.
Reste : la pluie tropicale par averses (la pluie actuelle sert pour l'instant).

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

## Le mode Casse-cou

Deux modes : **Arcade** (le jeu actuel) et **Casse-cou** (*Daredevil* en anglais). En Casse-cou,
déclencher un gadget lance un **mini-défi** de 2 à 3 secondes au milieu de l'écran ; le gadget agit
selon le résultat. But : plus de durée de vie, et du fun. S'inspirer du principe des micro-jeux très
courts, avec notre propre style.

### Décidé

- **Nom : Casse-cou.**
- **Déblocage : par pays**, proposé au joueur quand il arrive **au bout du pays en Arcade** : il suffit
  d'avoir **au moins 1 étoile au dernier niveau** (le 19 aujourd'hui), pas les 3 étoiles partout.
- **Réussite graduée**, un raté affaiblit le gadget mais ne l'annule pas. Valeurs de départ à régler :

  | Résultat | Effet du gadget | À l'écran |
  |---|---|---|
  | Parfait | ×1,5 (plus de rayon, plus de dégâts) | tampon « PARFAIT ! » doré |
  | Réussi | ×1 (comme en Arcade) | « BIEN ! » |
  | Raté | ×0,4 (pétard mouillé) | « RATÉ… » et une petite fumée comique |

  Enchaîner les « parfait » dans une partie fait monter un petit multiplicateur de score.
- **Étoiles et records Casse-cou séparés**, avec leurs propres seuils (plus hauts, puisque « parfait »
  renforce les gadgets ; le pilote automatique simulera parfait, réussi et raté pour les régler).
- **Les étoiles Casse-cou comptent pour débloquer les véhicules.**
- **Le T-Rex est le gadget ultime**, et c'est lui que remplace le gadget signature de chaque pays
  (tracteurs, kaiju, tornade, monstre du loch, char de carnaval, volcan).

### Le déroulé d'un mini-défi

- **Pas de pause sèche** : le défi se joue pendant un ralenti extrême, le carambolage visible en fond.
- **Un seul geste**, compris en une demi-seconde : un mot d'ordre en gros (« COUPE ! », « VISE ! »,
  « TAPE ! ») et une image.
- **Au doigt comme au clavier** : taper, glisser ou maintenir sur téléphone ; Espace et flèches sur ordinateur.
- **Plusieurs défis par gadget**, tirés au hasard, pour ne pas refaire toujours le même.
- **Une difficulté qui monte** avec les niveaux : la fenêtre de réussite rétrécit, le rythme s'accélère.
- **Une option « défis plus faciles »** (plus de temps) dans les réglages, pour les plus jeunes (7 ans et plus).

### Le catalogue

- **Dynamite** : couper le bon fil (trois fils de couleur, un seul indiqué) ; allumer la mèche (taper
  quand la flamme passe sur la marque) ; le détonateur (tapoter vite pour enfoncer la poignée).
- **T-Rex** : le rugissement (taper en rythme sur trois battements) ; le réveil (tapoter vite pour
  réveiller le dino qui ronfle).
- **Aimant**, automatique aujourd'hui : la charge (tracer un cercle). Il pourrait devenir déclenchable
  en Casse-cou seulement.
- **Gadgets des pays**, conçus avec leur pays :
  - boule de pétanque : le pointage (une jauge de force va et vient, taper dans la zone verte) ;
  - rayon du kaiju : la charge (maintenir, lâcher dans la zone verte ; trop tôt il est faible, trop
    tard il part de travers) ;
  - tornade : le tourbillon (tracer une spirale) ;
  - tracteurs en colère : le klaxon en rythme ;
  - char de carnaval : les tambours (suivre un rythme de batucada).

### À décider plus tard

- **Les roquettes** : leur garder un mini-défi (le viseur qui oscille, ou maintenir le doigt sur une
  cible qui bouge) ? Et même **les garder dans le jeu** ? À revoir, avec l'idée du bouchon de
  champagne prévue pour la France à leur place.

## Le frein sur téléphone et les obstacles dans la rue (idée du 2026-11-20)

Sur téléphone la voiture accélère seule : la rue n'est qu'une ligne droite où l'on vise. Avec un
**frein**, elle devient une épreuve de timing, et des **obstacles avant le carrefour** rendent le défi
plus grand. Le compte à rebours de la rue (22 s) fait déjà la tension : freiner coûte du temps.

**Le frein** (sur ordinateur il existe déjà : Bas / S). Où le mettre sur téléphone :
- **recommandé : maintenir le doigt au milieu de l'écran**, la grande zone libre entre GAUCHE et
  DROITE ; impossible à rater, ne masque rien ; un petit « FREIN » discret au centre ;
- autres options écartées : GAUCHE + DROITE ensemble (pas intuitif, empêche de braquer en freinant),
  un bouton FREIN au-dessus de DROITE (un pouce de plus à déplacer).

**Les règles des obstacles :**
- **toujours annoncés** (feux qui clignotent, sonnerie, barrières qui descendent ~2 s avant) : on les
  évite en regardant, pas par chance ;
- **un choc compte** (contrairement aux maisons frôlées dans la rue, sans conséquence) : proposé, il
  déclenche le carambolage sur place, dans la rue, avec peu de véhicules autour (un « carambolage
  raté » qui rapporte peu, sans écran d'échec brutal) — à décider ;
- **le pilote automatique** (`tools/balance/`) doit apprendre à freiner et à attendre, sinon les
  seuils de ces niveaux ne se mesurent plus ;
- le test des bonus (`tests/unit/levels.test.ts`) devra aussi vérifier qu'aucun bonus n'est sous un
  obstacle ;
- règle des 7 ans et plus : **pas de passage piéton à feu** (il suppose des piétons), ni d'animaux.

**Idées d'obstacles :**
- le **passage à niveau** : un train qui passe à un moment aléatoire, feux, sonnerie, barrières ;
- la **camionnette de livraison en double file** qui bouche une voie (cliché français) ;
- des **travaux** qui rétrécissent la rue (cônes, une voie fermée) ;
- un **bus** qui déboîte de son arrêt ;
- un **tram** qui traverse la rue (France) ;
- un **pont-levis** qui se lève (Royaume-Uni, plus tard : le Tower Bridge).

## Plus de ronds-points en France (idée du 2026-11-20)

Le rond-point (fait : le niveau 20, la place de l'Étoile) devient une mécanique courante en France :
**entre un niveau sur deux et un sur trois**.

- **Recommandé : un sur trois**, les niveaux 3, 6, 9, 12, 15, 18 plus la finale à l'Étoile (7 sur 20).
  À un sur deux, le carrefour classique deviendrait l'exception.
- **Varier les ronds-points** : la taille de l'anneau (2 à 5 voies), et ce qu'il y a au centre. Le
  cliché parfait : **les sculptures bizarres des ronds-points français** (un escargot géant, une
  énorme bicyclette, une théière géante…), chacune destructible avec son bonus ; l'Arc de Triomphe
  reste réservé à l'Étoile.
- **Tremplin + rond-point** : on décolle de la rue et on vole au-dessus de l'anneau ; au moins un niveau.
- Le rond-point reste français (décision du 2026-11-20 : pas au Royaume-Uni).
- Chaque niveau converti change de score : **seuils à remesurer** avec le pilote automatique.

## Des bonus sur le boulevard (idée du 2026-11-20)

Aujourd'hui les bonus sont tous dans la rue, avant le carrefour. **En mettre sur le boulevard**
donnerait enfin un intérêt au **pare-buffle** et à la **carrosserie renforcée** : ils laissent le volant
1 à 3 s après le premier choc, mais il n'y a rien à faire de ces secondes. Avec des bonus au milieu du
chaos, on fonce les ramasser.

- **Qu'ils apparaissent au moment du choc** plutôt que posés d'avance dans la circulation (le joueur les
  prendrait avant de percuter et le carrefour deviendrait trop facile) : par exemple les camions
  accidentés lâchent des pièces ou un ×2 qui roulent sur la chaussée. Ils ne servent qu'à qui garde le volant.
- **L'aimant les attire** vers la voiture pendant son effet : utile même sans pare-buffle.
- **Des bonus propres au boulevard** : « +2 s de compte à rebours », plutôt que le ×2, très puissant.
- **Revoir les durées** du pare-buffle (1 s) et du blindage (+2 s) une fois les bonus en place : 1 s est
  court pour aller en chercher un.
- Le pilote automatique devra apprendre à les ramasser, pour mesurer l'effet sur les scores.

## Autres pistes

- ~~Un **20ᵉ niveau** pour un compte rond~~ — fait : la place de l'Étoile (France).
- Le **bouton « Effacer la sauvegarde »** des réglages (commit `09d673b`) : à garder ou non pour la
  version publiée, à décider.
- ~~**Recalibrer tous les seuils** avec le pilote automatique~~ — fait le 2026-11-26 : les 5 pays, 20 parties par
  test (`propose.mjs --floor=0.1` : les carambolages ratés du pilote sont écartés). Le tremplin (niveau 3) est à
  150 k pour le 1★ dans tous les pays (réglé à la main). US 16 (Route 66 de nuit) garde ses anciens seuils : le pilote
  se jette sur le train dans 13 parties sur 19. Les prix du garage n'ont pas été touchés.
  À revoir en jouant : US 7 et 10 (1★ vers 2,1 M), Brésil 2 (2★ et 3★ serrés), France 20 (1★ passé de 16,1 à 7,15 M).
- **Un combo par pays** entre son gadget et le T-Rex (comme le combo jurassique en France).
