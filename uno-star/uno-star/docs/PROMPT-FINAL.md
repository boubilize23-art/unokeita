# 📋 Cahier des charges final — UNO STACK

> Version réécrite du cahier des charges d'origine, adaptée à un hébergement **Vercel**
> (front + API) et **Render** (serveur de jeu temps réel).
>
> Les écarts par rapport à la version initiale sont listés dans
> [`ANALYSE-PROMPT.md`](ANALYSE-PROMPT.md). Chaque section indique le point d'origine
> lorsqu'il a changé.

---

Je veux développer un jeu de cartes multijoueur en ligne inspiré des jeux de cartes de type
UNO, mais avec un système de règles personnalisé.

L'objectif est de créer une application web moderne, fluide, responsive et jouable sur
ordinateur et téléphone.

## 1. Nombre de joueurs

Le jeu doit permettre :

* minimum : 2 joueurs
* maximum : 7 joueurs

Le système doit permettre de créer une partie privée avec un code de salle.

Exemple :

* Joueur 1 crée une partie
* Le système génère un code : ABC123
* Les autres joueurs entrent ce code pour rejoindre la partie
* La partie peut commencer lorsque les joueurs sont prêts

Prévoir également :

* nom du joueur
* avatar simple
* indication « En attente » / « Prêt »
* bouton « Prêt »
* bouton « Démarrer la partie » pour l'hôte

**Précisions ajoutées :**

* Le code est tiré dans un alphabet **sans caractères ambigus** (ni `0/O`, ni `1/I`),
  sur 6 caractères : `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
* Un **lien de partage** est proposé dans le salon : `https://<app>/?room=ABC123`.
  Ouvrir ce lien pré-remplit le code de salle.
* Un joueur ne peut pas déposer son pseudo : un doublon reçoit automatiquement un suffixe
  (`Alice`, `Alice 2`).
* La salle est supprimée 10 minutes après son dernier joueur connecté.

## 2. Interface de jeu

Créer une interface moderne avec :

* la main du joueur en bas de l'écran
* la carte actuellement posée au centre
* la pioche
* la défausse
* les autres joueurs autour de la table
* nombre de cartes restantes pour chaque adversaire
* indication claire du joueur dont c'est le tour
* bouton « Piocher »
* bouton « Passer » lorsque nécessaire
* bouton « UNO » lorsqu'il ne reste qu'une carte
* animations lors de la pose des cartes
* animations lors de la pioche
* messages indiquant les actions importantes

L'interface doit être parfaitement utilisable sur ordinateur, tablette et téléphone.

**Précisions ajoutées :**

* **« Passer » n'apparaît que si le joueur n'a aucune carte jouable** et qu'aucune pile
  n'est en cours ; il pioche une carte et termine le tour.
* Quand une pile de pénalités est en cours, le bouton de pioche devient
  **« 🃏 Prendre +N »** avec le montant calculé par le serveur.
* Quand des cartes sont sélectionnées, un bouton **« ▶ Jouer »** devient actif si — et
  seulement si — la combinaison est légale.
* Un **journal** affiche les 5 derniers événements (coups, pénalités, pioches, UNO).
* Une **minuterie de tour** (45 s par défaut) se vide et déclenche une pioche automatique.
* Au-dessus de 900 px de largeur, les adversaires sont répartis **autour de la table** ;
  en dessous, ils passent dans un **bandeau horizontal défilant** en haut de l'écran.
* Les sièges des adversaires sont ordonnés dans l'ordre du jeu à partir du suivant.

## 3. Couleurs

Utiliser plusieurs couleurs classiques de cartes :

* Rouge
* Jaune
* Vert
* Bleu

Ajouter également des cartes spéciales **sans couleur**.

**Précision ajoutée — le joker est défini :**

* Un **joker** n'a pas de couleur et se joue **seul** (jamais combiné à d'autres cartes).
* Il est jouable à tout moment.
* Après l'avoir posé, le joueur **choisit la couleur active** (4 boutons).
* Il y a 4 jokers dans la pioche.

## 4. Cartes numériques

Le jeu doit comporter des cartes numériques (de **1 à 10**).

Lorsqu'une carte est posée, le joueur suivant peut normalement jouer :

* une carte de la même couleur
  OU
* une carte ayant le même numéro

Exemple :

Si la carte posée est :

BLEU 2

le joueur suivant peut jouer :

* n'importe quelle carte BLEUE
* n'importe quelle carte 2, quelle que soit sa couleur

**Précision :** un numéro correspond **uniquement à un autre numéro**. Un `+2` n'est pas
un « 2 » : il obéit uniquement à la règle des pénalités (section 6).

## 5. Règle spéciale des mêmes numéros

Le joueur doit pouvoir poser plusieurs cartes ayant le même numéro au même moment.

Exemple :

La carte précédente est :

BLEU 2

Le joueur possède :

* ROUGE 2
* JAUNE 2
* VERT 2

Il peut poser les trois cartes 2 ensemble, dans la même action.

Le système doit vérifier que les cartes ont effectivement le même numéro.

Cette possibilité doit fonctionner avec toutes les couleurs.

**Précision ajoutée — condition de validité du groupe :**

Toutes les cartes du groupe portent le **même numéro**, et le groupe est rattaché au
dessus **par la couleur ou par le numéro** :

* sur un **BLEU 2**, un groupe de 5 est **refusé** (aucun 5 bleu, et 5 ≠ 2) ;
* sur un **BLEU 5**, `ROUGE 5 + JAUNE 5 + VERT 5` est **accepté**.

Comme le groupe peut contenir plusieurs couleurs, **le joueur choisit la couleur qui
devient active** parmi celles qu'il a posées.

## 6. Cartes +2, +4, +8 et +10

Ajouter quatre types de cartes de pénalité :

* +2
* +4
* +8
* +10

Ces cartes doivent avoir une logique de cumul.

### Exemple 1

Un joueur pose :

+2

Le joueur suivant peut :

* poser un autre +2
* ou poser une carte de pénalité supérieure autorisée selon la logique du jeu

Si aucun coup défensif n'est possible, le joueur doit piocher le total accumulé.

Exemple :

+2 → +2 → +2

Le joueur suivant ne peut pas répondre.

Il pioche 6 cartes.

**Précision :** une carte de pénalité peut toujours être posée, **quelle que soit sa
couleur** (option `penaltyRequiresColorMatch`, désactivée par défaut). Une pénalité
ouvre donc toujours une chaîne.

## 7. Progression des cartes de pénalité

Les cartes de pénalité doivent respecter une logique hiérarchique.

Ordre :

+2 < +4 < +8 < +10

Un joueur soumis à une pénalité doit pouvoir répondre avec une carte permettant de continuer
le cumul selon cette hiérarchie.

Exemple :

Joueur A : +2
Joueur B : +4
Joueur C possède +4 → il peut répondre avec +4.

Le système doit toujours vérifier automatiquement si la carte jouée respecte les règles de cumul.

**Règle exacte :** tant qu'une pile est en cours, **toute** carte jouée doit être une
pénalité de valeur **supérieure ou égale** à la dernière pénalité posée. Un `+2` en
réponse à un `+4` est **refusé**, avec le message :

> « Cumul interdit : +2 ne peut pas répondre à un +4. Ordre : +2 < +4 < +8 < +10. »

## 8. Combinaison de plusieurs cartes identiques

Si un joueur possède plusieurs cartes de même pénalité, il doit pouvoir les jouer ensemble
lorsque les règles l'autorisent.

Exemple :

Le joueur possède :

+2 +2 +2

Il peut sélectionner les trois cartes et les jouer ensemble.

Le cumul devient :

+6

Autre exemple :

+4 +4

Le joueur peut jouer les deux cartes simultanément.

Le cumul devient :

+8.

Même logique pour :

+8 +8

et

+10 +10.

Le système doit calculer automatiquement la pénalité totale.

## 9. Combinaison de cartes de pénalité différentes

Le joueur doit également pouvoir combiner certaines cartes de pénalité différentes lorsque
la logique de cumul l'autorise.

Exemple :

+2 → +4

Le cumul devient :

+6.

Si le joueur suivant possède une carte +4 ou une carte supérieure autorisée, il peut continuer
le cumul.

Exemple :

+2 → +4 → +8

Cumul total :

14 cartes.

Si le joueur suivant ne possède aucune carte permettant de continuer la chaîne, le système lui
fait automatiquement piocher 14 cartes.

IMPORTANT :

Le système ne doit jamais permettre une combinaison qui viole la hiérarchie définie.

Créer une fonction centrale de validation des coups afin que toutes les règles soient vérifiées
automatiquement.

**Précisions ajoutées :**

* **Coups successifs et action groupée sont tous deux autorisés.** Répondre `+4` à un `+2`
  posé par le voisin, et poser `+2 +4` d'un seul bloc, donnent le même cumul (+6).
* **Garde-fou `maxCardsPerPlay = 5`** (configurable) : sans borne, la règle autorise
  vingt cartes d'un coup et les piles atteignent +150, ce qui rend la partie interminable
  (constaté en test automatisé). Les exemples du cahier des charges restent valides ;
  seule lplaying est bornée.
* Toute carte d'un groupe doit respecter la hiérarchie par rapport à la **dernière pénalité
  posée** : sur un cumul en cours à `+4`, jouer `[+2, +8]` est refusé.

## 10. Calcul automatique des pénalités

Le système doit conserver le total de la pénalité en cours.

Exemple :

+2
→ total = 2

+4
→ total = 6

+8
→ total = 14

+10
→ total = 24

Si aucun joueur ne peut continuer :

le joueur concerné pioche 24 cartes.

Après la pioche, le compteur de pénalité revient à zéro.

## 11. Interaction avec les cartes numériques

Les cartes normales doivent également respecter les règles classiques de couleur et de numéro.

Exemple :

Carte actuelle :

BLEU 5

Le joueur peut jouer :

* BLEU 8
* BLEU 2
* ROUGE 5
* JAUNE 5
* VERT 5

Et, si plusieurs cartes 5 sont disponibles :

ROUGE 5 + JAUNE 5 + VERT 5

peuvent être posées ensemble selon la règle des mêmes numéros.

**Précision :** quand un joker est au-dessus de la défausse, la **couleur choisie
lors de sa pose** devient la couleur de référence : seule cette couleur (ou un numéro
identique à celui du dessus) est acceptée.

## 12. Sélection des cartes

Le joueur doit pouvoir sélectionner plusieurs cartes dans sa main.

Lorsqu'une carte est sélectionnée :

* elle monte légèrement
* elle est visuellement mise en évidence

Le joueur peut sélectionner plusieurs cartes.

Le bouton « Jouer » devient disponible uniquement si la combinaison sélectionnée respecte
les règles.

Si la combinaison est invalide :

* empêcher la pose
* afficher un message explicatif

Exemple :

« Cette combinaison n'est pas autorisée. »

**Précision :** la sélection est **libre** (aucune validation a priori au clic) et le verdict
est recalculé à chaque changement, en direct, sous la main du joueur. Les cartes jouables
sont en outre distinguées visuellement (liseré vert / cartes inertes désaturées). Le serveur
revérifie systématiquement avant d'appliquer le coup.

## 13. Pioche automatique

Lorsqu'un joueur ne peut pas répondre à une pénalité, le système doit :

1. calculer le montant total
2. afficher le montant
3. faire piocher le nombre de cartes
4. réinitialiser la pénalité
5. passer au joueur suivant

**Précision importante :** l'action reste déclenchée **par le joueur** (bouton
« 🃏 Prendre +N »), car une pioche automatique lui retirerait son choix — mais le
**montant est calculé, affiché et appliqué par le serveur**, jamais par le client. Si la
pioche est vide, la défausse (sauf la carte du dessus) est remêlée pour compléter.

## 14. Règle UNO

Lorsqu'un joueur ne possède plus qu'une seule carte, il doit cliquer sur le bouton « UNO ».

Le système doit gérer automatiquement :

* l'annonce UNO
* la détection d'une absence d'annonce
* la pénalité définie dans les paramètres du jeu

Prévoir une règle claire et configurable pour la pénalité UNO.

**Précisions ajoutées — double mécanisme :**

1. **Automatique** : le serveur ouvre une fenêtre de 5 s dès qu'un joueur tombe à une carte.
   S'il ne crie pas UNO, il pioche automatiquement la pénalité (2 cartes par défaut).
2. **Signalement** : pendant son tour, un adversaire peut cliquer sur « 🗣 Signaler UNO »
   et déclencher la même pénalité. Un joueur déjà pénalisé ne peut pas être signalé deux fois.

Trois réglages, tous surchargeables par l'hôte : activation, délai, montant de la pénalité.

## 15. Fin de partie

Lorsqu'un joueur pose sa dernière carte :

* la partie s'arrête
* le système annonce le gagnant
* afficher le classement des joueurs
* afficher le nombre de cartes restantes des autres joueurs
* proposer « Rejouer » et « Quitter la partie »

**Précisions ajoutées :**

* Le classement trie par nombre de cartes restantes, puis par ordre alphabétique.
* « Rejouer » (hôte uniquement) ramène la salle au salon : tout le monde doit se remettre
  « prêt » avant la manche suivante.
* Personne ne peut jouer une fois la partie terminée.

## 16. Serveur multijoueur

Le jeu doit être réellement multijoueur.

Toutes les actions importantes doivent être gérées côté serveur afin d'empêcher les
tricheries. Le serveur doit contrôler : le tour actuel, les cartes de chaque joueur, la pioche,
la défausse, les cartes jouées, les pénalités, les combinaisons autorisées, la victoire, les
connexions et déconnexions.

Utiliser une communication temps réel avec **WebSocket / Socket.IO**.

Le client ne doit jamais être considéré comme une source fiable pour valider les règles.

**Précision :** le client n'envoie que des **intentions** (`game:play` avec des identifiants
de cartes). Le serveur revérifie le tour, la possession effective des cartes, toutes les règles,
puis diffuse un état **personnalisé** à chaque joueur.

## 17. Architecture recommandée

Utiliser une architecture simple et facilement déployable gratuitement.

Frontend : React, CSS moderne, interface responsive.
Backend : Node.js, Express, Socket.IO.
Le serveur doit gérer plusieurs salles de jeu simultanées, chacune avec un identifiant unique.

Structure possible :

/client
/server
/shared

Le dossier /shared contient les règles communes du jeu afin d'éviter de dupliquer la logique.

**Section réécrite — hébergement Vercel :**

Vercel héberge **le frontend (build statique) et les fonctions `/api`**.
Il ne peut pas héberger le serveur Socket.IO : une fonction serverless s'arrête après
~60 s et ne maintient aucune connexion WebSocket ni état en mémoire.

Il faut donc **deux cibles** :

| Brique | Hébergeur | Contenu |
|---|---|---|
| Front + API | **Vercel** | build statique `client/dist` + `/api` (santé, URL du serveur) |
| Serveur de jeu | **Render** (ou Railway / Fly.io) | `npm start` → Node + Express + Socket.IO, port 3001 |

Le client ne connaît le serveur de jeu que par **une variable d'environnement**
(`VITE_WS_URL`), donc le passage d'un hébergeur à un autre ne demande aucune modification
de code.

`/shared` est un **package npm** (npm workspaces) importé par le client **et** le serveur :
le client peut ainsi afficher un verdict de combinaison, mais seul le serveur décide.

## 18. Gestion des déconnexions

Si un joueur se déconnecte accidentellement :

* conserver temporairement sa place
* permettre sa reconnexion
* ne pas recommencer automatiquement la partie
* afficher « Joueur déconnecté »

Si le joueur ne revient pas après un délai configurable, permettre à l'hôte de le retirer.

**Précisions ajoutées :**

* Chaque joueur reçoit un **jeton de reconnexion** stocké dans son navigateur.
  À son retour, il retrouve **exactement sa main** (les tests le vérifient).
* Pendant l'absence, son tour est passé automatiquement après un **délai court (8 s)**
  afin de ne pas bloquer les autres : le minuteur normal (45 s) reste réservé à un joueur
  connecté qui réfléchit. S'il se reconnecte pendant son tour, il récupère son temps complet.
* Si l'hôte se déconnecte, l'hôtellerie est transférée au premier joueur connecté.
* Le salon n'est pas réinitialisé : la partie continue avec les mêmes cartes.

## 19. Sécurité

Ne jamais envoyer au navigateur les cartes secrètes des autres joueurs. Chaque joueur doit
uniquement recevoir : ses propres cartes, le nombre de cartes des autres joueurs, les
informations publiques de la partie.

Le serveur doit vérifier chaque action. Un joueur ne doit jamais pouvoir modifier son nombre
de cartes depuis le navigateur.

**Précision ajoutée :** les états diffusés ne doivent contenir **aucun identifiant de carte
adverse** (et pas seulement aucune carte) ; un test automatisé le vérifie explicitement.

## 20. Design

Créer un design de table de jeu moderne. La table doit avoir : un fond agréable, une zone
centrale pour les cartes, des cartes avec de belles animations, des effets lors des
+2, +4, +8 et +10, une indication claire du joueur actif.

Ne pas utiliser de ressources protégées appartenant à une marque existante. Créer des cartes,
icônes et éléments graphiques originaux.

**Précisions ajoutées :**

* **Zéro ressource externe** : cartes, avatars, icônes et sons sont générés en CSS, SVG et
  WebAudio. Aucune police, aucune image, aucun fichier audio dans le dépôt.
* Les animations doivent être désactivables (`prefers-reduced-motion`).
* Le son est coupable d'un bouton de coupure.

## 21. Règle fondamentale

Toutes les règles doivent être centralisées dans un moteur de règles.

Créer notamment des fonctions comme :

canPlayCard()
canPlayMultipleCards()
canStackPenalty()
calculatePenalty()
canPlaySameNumberGroup()
drawPenalty()
isValidTurn()

Ainsi, les règles seront faciles à modifier plus tard.

**Fonctions ajoutées :** `accumulatePenalty()` (cumul en cours et seuil de réponse),
`getPlayableCards()` et `findPlayableGroups()` (surlignage), `canRespondToPenalty()`
(le joueur peut-il répondre ?), `explainSelection()` (message d'aide).

Toutes ces fonctions sont **pures** (aucun effet de bord) et vivent dans `/shared` :
elles sont testables isolement et réutilisées telles quelles par le serveur.

## 22. Tests obligatoires

Avant de considérer le projet terminé, créer des tests pour vérifier notamment :

1. +2 sur +2
2. +2 sur +4
3. +4 sur +4
4. +4 sur +8
5. +8 sur +10
6. plusieurs +2 simultanément
7. plusieurs +4 simultanément
8. plusieurs +8 simultanément
9. plusieurs +10 simultanément
10. combinaison de pénalités différentes
11. combinaison de plusieurs cartes ayant le même numéro
12. carte de même couleur
13. carte de même numéro mais couleur différente
14. coup invalide
15. absence de réponse à une pénalité
16. pioche automatique
17. annonce UNO
18. victoire
19. déconnexion/reconnexion
20. partie à 7 joueurs

**Compléments ajoutés :**

21. confidentialité : aucun identifiant de carte adverse dans les états diffusés
22. ordre des tours sur 7 joueurs + refus d'un 8ᵉ joueur
23. joker : couleur imposée, groupes de même numéro
24. action PASS / RETOUR
25. limite `maxCardsPerPlay`
26. **test de fumée** : une vraie partie jouée de bout en bout par de vrais clients
    Socket.IO, jusqu'au gagnant et au classement final

## 23. Livrable final

Je veux recevoir un projet complet et fonctionnel comprenant : frontend, backend, serveur
WebSocket, moteur de règles, système de salles, système multijoueur, interface responsive,
animations, tests, README avec les instructions d'installation, fichier .env.example,
package.json correctement configuré, configuration permettant le déploiement gratuit.

Le projet doit pouvoir être lancé localement avec des commandes simples comme :

npm install
npm run dev

Puis être déployé sur un serveur gratuit.

**Compléments ajoutés au livrable :**

* `vercel.json` + dossier `api/` (déploiement du front et de l'API sur Vercel)
* `render.yaml` (déploiement du serveur de jeu en un clic depuis le dépôt)
* `scripts/smoke.mjs` : partie complète jouée sans navigateur
* captures d'écran de l'interface (bureau et mobile)

## 24. Configuration de déploiement

* **Vercel** : `npm run build` → `client/dist`. Variables : `WS_URL` et `VITE_WS_URL`
  pointant vers le serveur de jeu. L'API `/api` renvoie l'URL configurée et `/api/health`
  l'état du service.
* **Render** : plan gratuit, `npm start`, sonde de santé sur `/api/health`.
  Variable `CLIENT_ORIGIN` = URL du front Vercel.
* **En local** : `npm run dev` lance les deux, le front en 5173 et le serveur en 3001.
* **Après modification de `VITE_WS_URL`**, il faut relancer un build (la valeur est
  compilée dans le front).

## 25. Réglages par défaut

Tous surchargeables par l'hôte dans le salon, centralisés dans un seul fichier
(`shared/src/constants.js`) :

| Réglage | Défaut |
|---|---|
| Joueurs | 2 à 7 |
| Cartes par joueur | 7 |
| Règle UNO | activée, fenêtre 5 s, pénalité 2 cartes |
| Pénalité : contrainte de couleur | désactivée |
| Pénalité : réponse ≥ valeur posée | obligatoire |
| Cartes max par action | 5 |
| Temps de tour | 45 s |
| Délai si le joueur est déconnecté | 8 s |
| Conservation d'une place déconnectée | 60 s |

---

IMPORTANT : Ne pas créer uniquement une maquette visuelle. Je veux un véritable jeu
multijoueur fonctionnel avec les règles décrites ci-dessus.
