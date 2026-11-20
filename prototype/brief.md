# Game Brief: Carambolage

## In your words

> Un jeu html où le joueur conduit une voiture en vue du dessus et en faux 3D qui se passe dans une ville jusqu'à arriver à un carrefour où d'autres voitures, camions, bus, motos, etc ... sont en train de rouler. Le but du jeu est de causer le plus de dégats. Pour cela le joueur guide sa voiture jusqu'au carrefour, dès que la voiture du joueur touche une autre voiture ou un mur, il ne peut plus controller la voitire. Sile joueur touche un véhicule, celui-ci est endommagé, et l'inertie peu le faire changer de voie, ce quioccasionne aussi des dégats sur les voitures qui roulent sur l'autre voie. Il y aura plusieurs niveaux. Il y aura aussi des bonus qui permettent de gagner des points, accélérer le véhicule du joueur, multiplier les points obtenis à la fin. Les points sont calculé sur la base des déghats réalisés, le but étant de faire le plus de dégats possible. Enavancant dans les niveaux, on pourra imaginer des routes plus complexes, des tremplins, d'autres véhicules, plusieurs voies, etc ...
>
> 1. Conduite : Arcade et nerveuse, mais chaque véhicule a un poid différent, le bus étant plu slourd qu'une moto, l'impact le fera moins dévier de sa trajectoire que la moto qui volera
> 2. Look : une ville en low-poly stylisé, couleurs saturées façon arcade des années 90
>
> After play: C'est bien, mais il faudrait quelques ajustements pour un peu plus de fun. Quand la voiture percute un autre véhicule, un compte à rebours se lance (de 7 secondes), c'est à la fin de ce compte à rebours que nous calculeront les dégats. Lorsqu'un véhicule est touché, si par exemple il est décalé sur la voie d'à coté, les voitures qui arrivent dans sa direction réalisent aussi un accident, c'est ca le fun de ce jeu, c'est de créer le plus gros accident. Pour cela, il faut que les dégats réalisés par le joueur sur le premier véhicule génère un accident avec les autres véhicules qui arrivent
>
> After play: C'est pas mal du tout pour un début, mais on va continuer de l'améliorer. Quand un véhicule autre que celui du joueur est percuté, il searit amusant de voir qu'il perd de l'huile à partir de l'endroit où il a été percuté jusqu'à la nouvelle position oùil s'arrête après le choc. Si des véhicules roulent sur cette huile, ils partent en tête à queue pour finir par s'encasterer quelque part. Il y a des camions qui ressemblent à des camions citernes, c'est très bien. Si ces camions sont touchés, il serait amusant qu'ils epxlosent, ce qui pousserait les autres véhicules aux alentours (ceux qui ont déja eu un accident mais aussi ceux qui n'en ont pas encore eu!). Ensuite, pour la durée de vie du jeu, il faudrait proposer à l'utilisateur dans le menu des améliorations. Ces améliorations pourront être achetés avec la somme totale des meilleurs score de chaque niveau. Parmis les améliorations, on pourrait commencer par proposer d'améliorer le moteur pour que la voiture aille plus vite. Un pare buffle, qui permettrait au joueur de pouvoir continuer à manier le véhicule 1 seconde après le premier choc, de la dynamite, qui une fois équipé sur la voiture permet au joueur d'appuyer sur une touche pour déclancher une explosion de sa voiture et qui créérait un souflle autour de la voiture
>
> After play: Là ca commence à être fun :-) Il faudra rajouter d'autres types de véhicules, un camion de pompier par exemple. FInalement il faudrait avoir un compte à rebour de 10 secondes au lieu des 7. Je verrai après si on l'enlève ou pas, il pourrait être remplacé par la détection que plus aucun accident n'arrivera. Il faudrait aussi rajouter des niveaux, mais pour l'instant je manque d'idées quand aux nouveaux niveau, il faudrait que le joeuur sente aussi une progression dans les niveaux (toujours plus grand et plus fous). Il y a un petit bug, l'écran s'arrête de bouger dès que la voiture fait sa première percussion, il fadurait que l'écran suive toujours la voiture (sauf au début du niveau où on voit le carrefour avant de recentrer sur la voiture, ca c'est très bien). J'aimerai aussi qu'on puisse jouer à ce jeu sur un smartphone, il faudrait que si le jeu détecte qu'il est lancé sur un smartphone, des boutons de direction apparaissent à gauche de l'écran (pour tourner à gauche) et à droite de l'écran (pour tourner à droite). Il faudrait aussi des boutons pour relancer la partie, revenir au menu et lancer la dynamite.
>
> After play: Le meilleur moment c'est l'explosion des citernes
>
> After play: C'est très bien , mais sur mobile c'est assez petit ... Il y a un moyen pour faire en sorte que le jeu soit en plein écran ?
>
> After play: Il reste des petits ajustements. La vitesse de base duvéhicule est trop élevée, du coup quand on selectionne les bonus de vitesse, la voiture devient vraiment rop rapide et incontrôlable ... Ensuite, parmis les améliorations qui font l'évolution du jeu, indispensable aux joueurs pour qu'ils continuent à jouer, il faudrait plus de bonus à acheter dans le garage. La vitesse c'est ok. On a le parre buffle, on pourrait proposer une carrosserie supplémentaire qui donnerai au joeuur 2 secondes de controle supplémentaire après le choc. On a la dynamite, on pourrait ensuite permettre d'avoir un lance roquette sur le toit (qui serait en plus de la dynamite) et qui lancerait une roquette quand on clique sur un bouton dédié (comme la dynmaite) et qui ferait exploser le ou les véhicules impactés par la roquette. As-tu da'utres idées de bonus ? On pourrait aussi permettre au joueur de jouer avec d'autres véhicule (un van, une ambulance, un camion, un camion avec une remorque, etc). As-tu aussi d'autres idées qui rendraient le jeu plus riche ?
>
> After play: Toutes tes idées sont très bonnes, implémentent les toutes. Profite en aussi pour revoir les dégats à la baisse ou remonter les objectifs. Le jeu est trop simple, il faut un peu de défi !
>
> After play: c'est toujours trop facile, il faut relever l'objectif de score nécessaire pour obtenir les 3 étoiles. Il faut aussi augmenter le prix des améliorations, il est possible de les acheter trop tôt dans le jeu. Je pense que les améliorations doivent être achetées uniquement pour un véhicule. Si l'utilisateur achète un nouveau véhicule, il lui faut racheter les gadjets, sans quoi la durée de vie du jeu sera trop courte ... J'aime bien le concept des flammes quand les voitures brulent mais les triangles ne sont pas très joli. Tu penses arriver à un meilleur rendu tout en conservant le look un peu pixel art de ce jeu ?
>
> After play: Il semble aussi y avoir un petit bug, quand on sort du garage, les touches ne répondent plus, tu pourrais fixer cela ?
>
> After play: Il reste des petits soucis. Les voitures semblent déja se rentrer dedans avant même que la voiture du joueur n'arrive au carrefour, du moins on entend des bruits de carambolage et l'ecran bouge un peu. Il ne devrait pas y avoir de carambolage tant que la voiture du joueur n'est pas rentré dans une voiture du carrefour. Avec le tremplin, il arrive que la voiture sorte de la carte, comme si la voiture arrivait à passer au dessus du batiment. Il ne faudrait pas rendre cela possible. Enfin le jeu est encore beaucoup trop facile, il faut remonter grandement les scores nécessaires à l'obtention d'une, deux et trois étoiles
>
> After play: Le ralenti de fin est une bonne idée, mais il y a un petit soucis, on y trouve les traces d'huiles qu'on trouve à la fin dèsle début du replay, ce n'est pas logique, il faudrait fixer cela. Mainetannt la difficulté du premier niveau est trop élevé, et celui des niveaux suivants est trop facile, il faut revoir les paliers d'étoiles
>
> After play: On devient pas mal pour les scores. Mais les prix des gadgets et voitures sont trop accessibles ... Peut être que les voitures devraient se débloquer uniquement avec le nombre d'étoiles totales obtenues. Plus la voiture est intéressante (comme dans l'ordre actuel), plus il faut d'étoiles pour pouvoir l'obtenir. De la même manière, le prix des gadgets devrainet être plus cher au fur et à mesure que la voiture est intéressante. Et j'aurai besoin d'une dizaine de niveaux supplémentaires. Tu pourrais me faire cela ? Avec tout ces niveaux (et ce n'est que le début ..), il fadurait peut être revoir a manière dont on peut selectionner le niveau dans la page d'acceuil. Peut être à la manière d'une roue
>
> After play: Tu peux revoir le jeu de telle sorte que si la voiture touche les maisons avant d'arriver au carrefour, la voiture ne se casse pas et le joueur peut continuer à la controler ?

**Pitch:** Tu fonces dans les rues jusqu'à un carrefour bondé, et un seul impact déclenche le plus gros carambolage possible.

**Genre:** racing / car combat (mode crash)

**Controls:** flèches ou ZQSD pour accélérer, freiner et tourner. Après le premier choc, plus aucun contrôle. R pour rejouer, Entrée pour le niveau suivant, U au menu pour le garage, Espace pour la dynamite et F pour la roquette une fois achetées. *(guessed)*

**Question:** est-ce que viser le bon moment pour percuter le trafic, puis regarder la réaction en chaîne, donne envie de rejouer ?

**Hooks:** le premier contact coupe le contrôle. Chaque véhicule réagit à l'impact selon son poids : la moto vole, le bus encaisse. Les véhicules déviés envahissent l'autre voie et déclenchent des chocs en chaîne.

**Intent:**

## Look and references
- Look: ville en low-poly stylisé, couleurs saturées façon arcade des années 90. Les immeubles sont des blocs en relief dont les toits se décalent avec la caméra (parallaxe faux 3D), avec des ombres portées. Asphalte gris-bleu, marquages blancs et jaunes. Ta voiture est rouge vif, le trafic en couleurs distinctes selon le type : taxis jaunes, bus orange, camions blancs et bleus, motos noires. Détail signature : au choc, gerbe d'étincelles, fumée, débris, et les carrosseries se cabossent et noircissent avec les dégâts *(inferred (strong))*. Chaque véhicule est dessiné (vitres, phares, roues) : every figure drawn, no emoji, no plain circles.
- References: Burnout (le mode Crash : le carrefour comme puzzle de destruction) *(inferred (strong))*.
- View: 2.5D · Camera: vue de dessus inclinée qui suit ta voiture, puis dézoome au choc pour montrer tout le carambolage *(provisional)*.

## First minute
Le niveau 1 démarre dans une rue bordée d'immeubles. Une flèche indique le carrefour. Tu accélères, tu ramasses un bonus « boost » posé sur la route, et tu vois au loin le trafic qui traverse le carrefour. Tu ajustes ta vitesse pour arriver quand une voiture passe. Choc : elle part en travers, une moto sur l'autre voie s'envole, un taxi pile dedans. Le compteur de dégâts monte en direct, puis l'écran de score montre les dégâts × le multiplicateur. *(guessed)*

## Challenge
Chaque niveau a un seuil de dégâts pour passer au suivant. Sous ce seuil, tu recommences le niveau. Le niveau 1 se passe facilement. Au niveau 2, il faut viser le bus ou le camion au bon moment. Au niveau 3, le tremplin demande d'arriver à la bonne vitesse pour atterrir au cœur du trafic. Toucher un mur avant le carrefour ne casse rien : la voiture frotte, perd de la vitesse et tu gardes le volant. *(provisional)*

## Core loop
- Conduire jusqu'au carrefour en ramassant les bonus (points, boost, multiplicateur)
- Choisir le moment et l'angle de l'impact. Au contact, tu perds le contrôle.
- La physique propage le chaos : déviation selon le poids, changements de voie, chocs en chaîne, dégâts cumulés
- Score = dégâts × multiplicateur, comparé au seuil, puis on rejoue ou on passe au niveau suivant

## Goal & fail state
- Atteindre le seuil de dégâts de chaque niveau et battre son meilleur score. Au premier choc, un compte à rebours de 10 secondes se lance ; les dégâts sont comptés à sa fin.

## Features
- [x] Rue en ville menant à un carrefour, avec murs et immeubles en faux 3D
- [x] Voiture du joueur arcade et nerveuse. Contrôle coupé au premier contact avec un véhicule ; avant le carrefour, frotter un immeuble ne casse rien.
- [x] Trafic multi-voies et multi-directions : voitures, taxis, camions, bus, motos, chacun avec sa masse
- [x] Physique d'impact par poids : la moto vole, le bus dévie peu. Changements de voie et chocs en chaîne.
- [x] Compte à rebours de 10 s au premier choc ; dégâts comptés à la fin
- [x] Véhicules d'urgence : camion de pompiers, ambulance, voiture de police, avec gyrophares
- [x] 19 niveaux toujours plus grands et plus fous : L'heure de pointe (4 voies, trafic dense), Le convoi (citernes, huile déjà sur la route, tremplin), Le grand chaos (5 voies, tout le monde, plus vite)
- [x] La caméra suit toujours la voiture, après le choc aussi (l'intro qui montre le carrefour reste)
- [x] Sur smartphone : boutons gauche / droite sur les côtés, Rejouer, Menu, Dynamite ; la voiture accélère seule ; menus, garage et fin de course au doigt
- [x] Sur smartphone : plein écran et paysage demandés au premier toucher (bouton PLEIN ÉCRAN au menu), jeu étiré à la forme de l'écran, caméra et tableau de bord 30 % plus gros
- [x] Après le premier choc, les véhicules qui arrivent freinent tard et s'encastrent dans l'épave : le carambolage grossit
- [x] Un véhicule percuté perd de l'huile du point d'impact jusqu'à son arrêt ; qui roule dessus part en tête-à-queue
- [x] Les camions-citernes touchés explosent et soufflent tous les véhicules autour, accidentés ou non (et les autres citernes)
- [x] Garage dans le menu, payé avec la somme des meilleurs scores : moteur (3 niveaux), pare-buffle (1 s de contrôle après le choc), dynamite (Espace : ta voiture explose)
- [x] Garage : carrosserie renforcée (+2 s de contrôle après le choc, après le pare-buffle) et lance-roquettes sur le toit (F ou bouton ROQUETTE, 2 par course : la roquette fait exploser ce qu'elle touche)
- [x] Garage, onglet Véhicules : jouer avec la sportive, un van, une ambulance, un camion ou un semi-remorque (la remorque suit et peut se mettre en portefeuille)
- [x] Vitesse de base plus basse pour que le turbo reste contrôlable
- [x] Garage : aimant à épaves, nitro de choc (N), bidon d'huile (H : ton huile fait déjà déraper le trafic avant ton choc), ressort (J), assurance (+25 % au score), compte à rebours +3 s ; trois onglets
- [x] 3 défis par niveau (détruire, faire sauter des citernes, toucher N véhicules, un score) qui rapportent du crédit une fois
- [x] 1 à 3 étoiles par niveau selon le score (objectif, ×2, ×3,2)
- [x] Replay du carambolage à la fin, au ralenti puis en accéléré (V pour le revoir) ; l'huile, les traces et les brûlures y apparaissent au moment où elles se sont faites
- [x] Niveaux 7 à 9 : Sous la pluie (ça glisse), Nuit noire (phares), L'autoroute (6 voies, barrière centrale, tremplin)
- [x] Événements surprises à mi-rue : convoi exceptionnel, course-poursuite, citerne géante
- [x] Carambolage du jour : un carrefour tiré de la date, record du jour ajouté au crédit
- [x] Plus de défi : dégâts ×0,7 environ, objectifs en pente raide (14 000 € au niveau 1, puis 120 000 € jusqu'à 2 200 000 € au niveau 9)
- [x] Améliorations et gadgets propres à chaque véhicule (un nouveau véhicule repart de zéro), prix ×2,5 environ
- [x] Aucun accident avant ton choc (sauf sur ton huile) ; personne ne passe au-dessus des immeubles, murs invisibles autour de la carte
- [x] Véhicules débloqués par le total d'étoiles (van 6, ambulance 15, camion 27, semi-remorque 42) ; prix des améliorations ×1,5 et multipliés selon le véhicule au volant (×1 à ×4,8)
- [x] Niveaux 10 à 19 : Brouillard, Verglas (neige), La rue courte, Convoi de nuit, Tempête, Les motards, Pompiers en folie, Autoroute de nuit, Blizzard, Le grand final (7 voies)
- [x] Page d'accueil : les niveaux sur une roue (flèches, molette, glisser au doigt), le niveau choisi en face, ses étoiles et son record
- [x] Flammes et fumée en pixel art (carrés sur une grille, cœur clair, pointes rouges)
- [x] Dégâts visibles par véhicule, score des dégâts en direct
- [x] Bonus sur la route : points, boost de vitesse, multiplicateur de fin
- [x] 3 premiers niveaux : carrefour 2 voies ; multi-voies avec bus et camions ; tremplin *(provisional)*
- [x] Écran de score avec seuil, meilleur score, rejouer ou niveau suivant

## Your systems
- trafic au carrefour · in the slice
- dégâts et inertie qui fait changer de voie · in the slice
- bonus (points, accélération, multiplicateur) · in the slice
- plusieurs niveaux · in the slice
- tremplins · in the slice *(guessed)*
- routes plus complexes · later
- autres véhicules (pompiers, ambulance, police) · in the slice
- jouer sur smartphone avec des boutons · in the slice
- huile qui fait partir en tête-à-queue · in the slice
- explosion des camions-citernes · in the slice
- améliorations achetées avec les meilleurs scores (moteur, pare-buffle, carrosserie, dynamite, lance-roquettes) · in the slice
- jouer avec d'autres véhicules (van, ambulance, camion, camion avec remorque) · in the slice
- défis et étoiles par niveau · in the slice
- replay du carambolage · in the slice
- pluie, nuit, autoroute, brouillard, verglas · in the slice
- véhicules débloqués par les étoiles · in the slice
- choix du niveau sur une roue · in the slice
- événements surprises · in the slice
- carambolage du jour · in the slice

## Keep
- Il y a des camions qui ressemblent à des camions citernes, c'est très bien *(you said)*
- Le ralenti de fin est une bonne idée *(you said)*
- J'aime bien le concept des flammes quand les voitures brulent *(you said)*
- Le meilleur moment c'est l'explosion des citernes *(you said)* · pins: tanker_blast 1700, tanker_radius 230, tanker_trigger 45, tanker_fuse 0.45

## Avoid
-

## Out of scope
- routes plus complexes (virages, ponts, carrefours à 4 branches): add it as a feature
- fin du carambolage détectée quand plus aucun accident ne peut arriver, à la place du compte à rebours: change it after play
- écran partagé à deux: change it after play
- classements en ligne: needs a server: not built yet

## Build order
1. La tranche : le niveau 1 complet. Conduite, contact qui coupe le contrôle, trafic, impact par poids, chocs en chaîne, dégâts, score et seuil, rejouer.
2. Bonus (points, boost, multiplicateur) et écran de score final
3. Niveaux 2 et 3 (multi-voies avec bus et camions ; tremplin)

---
**Kill condition:** si regarder la réaction en chaîne n'est pas satisfaisant après deux réglages de la physique. *(guessed)*

**Who it's for / what they feel:** joueurs arcade qui veulent la joie d'un chaos spectaculaire en sessions de 30 secondes. *(guessed)*

**Games you love / don't:** Burnout, mode Crash *(inferred (strong))*.
