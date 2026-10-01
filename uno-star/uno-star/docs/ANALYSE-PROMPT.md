# Analyse du cahier des charges initial

Ce document explique **ce qui a été retiré, corrigé ou ajouté** dans la version finale
du prompt, et pourquoi. Le prompt final lui-même est dans [`PROMPT-FINAL.md`](PROMPT-FINAL.md).

> Rappel : Vercel a été choisi comme hébergeur du frontend. C'est un excellent choix pour
> le front et l'API HTTP, **mais techniquement impossible pour un WebSocket persistant**.

---

## 🔴 1. Le point bloquant : Vercel ne peut pas héberger le serveur de jeu

**Section d'origine :** 16 (« Serveur multijoueur »), 17 (« Architecture »),
23 (« Livrable final »).

Le cahier des charges demandait « frontend + backend + serveur WebSocket » sur
« un serveur gratuit », et le choix demandé est Vercel.

Or une fonction Vercel (Lambda) :

- s'arrête après **~60 s d'exécution maximum** (configurable, mais c'est un plafond dur) ;
- **n'accepte pas les connexions WebSocket persistantes** ;
- n'a **aucune mémoire** entre deux requêtes : l'état d'une partie ne peut pas y vivre.

Un jeu multijoueur a besoin d'un processus Node **qui reste vivant** et en mémoire
(salles, mains des joueurs, Pioches).

### Décision retenue

| Brique | Hébergeur | Rôle |
|---|---|---|
| Front statique + fonctions `/api` | **Vercel** (gratuit) | interface, configuration, URL du serveur, santé du service |
| Serveur Socket.IO | **Render** (ou Railway / Fly.io) | état des parties en mémoire, WebSocket |

Les deux sont gratuits, et le client ne connaît qu'une variable : `VITE_WS_URL`.
Le prompt d'origine est conservé pour toute la logique serveur — c'est uniquement
l'hébergement qui est scindé, et c'est explicité dans la section 17 du prompt final.

---

## 🟠 2. Ambiguïtés de règles à trancher

Le moteur de règles ne peut pas être écrit tant que ces points ne sont pas définis.

### 2.1 « Combiner des pénalités différentes » : dans un seul coup ou coup après coup ?

**Sections 9 et 10.** L'exemple `+2 → +4 → +8 = 14` est une **chaîne de coups successifs**,
mais le titre de la section 9 parle d'une « combinaison ».

→ **Retenu : les deux sont autorisés.** Un joueur peut répondre avec `+4` à un `+2` posé
par son voisin (coups successifs), et poser `+2 +4` d'un seul bloc (une seule action).
Dans les deux cas, chaque carte doit être **≥ à la dernière pénalité posée**.

### 2.2 Les cartes `+2` doivent-elles respecter la couleur ?

Le cahier des charges ne le dit jamais. Dans l'UNO officiel, un `+2` doit suivre la couleur.

→ **Retenu : non, par défaut.** Une pénalité ouvre toujours une chaîne, sinon le cumul
devient illisible et le joueur peut se retrouver bloqué sans issue lisible. Le moteur
expose l'option `penaltyRequiresColorMatch` (par défaut `false`) pour revenir au
comportement strict.

### 2.3 « Piocher automatiquement » (section 13)

Le texte dit « faire piocher automatiquement le nombre de cartes ». Une pioche automatique
priverait le joueur de son choix, et en pratique il doit cliquer sur un bouton.

→ **Retenu :** c'est le joueur qui décide d'abandonner la pile, mais c'est **le serveur qui
calcule, affiche et applique** le montant. Le bouton devient « 🃏 Prendre +14 », le journal
trace l'événement, et le compteur repart à zéro. C'est la seule lecture compatible avec
« le client n'est pas une source fiable ».

### 2.4 « Bouton Passer » : quand exactement ?

**Section 2.** Sans définition, un bouton « Passer » permanent est ambigu.

→ **Retenu :** le bouton n'apparaît que si le joueur n'a **aucune carte jouable** et qu'aucune
pile n'est en cours ; il pioche alors une carte et termine le tour. Quand une pile est en
cours, il devient « Prendre +N ». Quand des cartes sont sélectionnées, c'est « Jouer ».

### 2.5 « Cartes spéciales sans couleur » (section 3)

 formulation trop vague pour être implémentable telle quelle.

→ **Retenu :** des **jokers**. Un joker se joue **seul**, n'importe quand, et le joueur
choisit la couleur active. Précisé également le nombre du joker et sa place dans la pioche.

### 2.6 Composition de la pioche

Absente du cahier des charges.

→ **Ajouté :** 136 cartes (1→10 × 4 couleurs × 2, +2/+4/+8/+10 × 4 couleurs × 2,
PASS et RETOUR par couleur, 4 jokers), 7 cartes par joueur, défausse remêlée si la
pioche est vide.

---

## 🟡 3. Risque d'équilibrage mesuré (et sa correction)

**Sections 6 à 10.** La règle « on peut poser plusieurs pénalités d'un coup » combinée
avec « la hiérarchie n'est pas bornée en valeur » produit une **déflagration** du jeu.

Constat réel lors des tests automatisés : une IA qui vide sa main d'un bloc et continue
le cumul atteint des piles de **+170 cartes**, la pioche se vide, les mains atteignent
60 cartes, et la partie ne se termine plus (reproduction : `npm run smoke`).

→ **Ajouté : un garde-fou configurable** `maxCardsPerPlay = 5` (section 9 du prompt final).
Les exemples du cahier des charges (+2+2+2 = +6, +4+4 = +8) restent valides ; on empêche
seulement de déjouer 20 cartes d'un coup. La correction est **centrée dans le moteur de
règles** et donc désactivable d'une ligne.

---

## 🟢 4. Compléments ajoutés (manquants ou trop courts)

| Section d'origine | Ajout | Pourquoi |
|---|---|---|
| 1 | alphabet de code sans caractères ambigus (`0/O`, `1/I` exclus), lien de partage `?room=CODExxx` | les codes `O01` / `I12` sont illisibles à voix haute |
| 2 | minuterie de tour (45 s) avec pioche automatique | évite qu'un joueur absent bloque la table |
| 2 | journal des 5 derniers événements | « messages indiquant les actions importantes » n'était pas défini |
| 14 | double mécanisme UNO : minuterie serveur **et** signalement par un adversaire | le texte disait « gérer automatiquement la détection », sans dire comment |
| 18 | le joueur déconnecté joue automatiquement (pioche) pendant son tour | sinon la table s'arrête |
| 19 | aucune fuite d'**identifiants** de carte dans les états diffusés | le « nombre de cartes » seul peut laisser filtrer des identifiants |
| 20 | sons générés en WebAudio, aucune resource externe | cohérent avec « pas de ressource protégée » |
| 21 | `accumulatePenalty()`, `getPlayableCards()`, `findPlayableGroups()`, `canRespondToPenalty()` | la liste d'origine ne couvrait pas le cumul en cours ni l'affichage |
| 22 | + tests de confidentialité, d'ordre des tours, de joker, d'action, de limite de coup | les 20 tests demandés ne vérifiaient pas le point 19 (sécurité) |
| 22 | **test de fumée** qui joue une vraie partie jusqu'au gagnant | un test unitaire ne prouve pas que le jeu se termine |
| 23 | `render.yaml`, `vercel.json`, `api/`, `.env.example` | pour un déploiement réellement en un clic |
| 24 (nouveau) | configuration de déploiement en deux cibles | conséquence directe du point 1 |
| 25 (nouveau) | réglages par défaut, tous surchargeables | le texte demandait « une règle UNO claire et configurable » |

---

## ⚪ 5. Ce qui a été **conservé tel quel**

- 2 à 7 joueurs, code de salle privé, pseudos, avatars, « Prêt », « Démarrer » (hôte).
- Les 4 couleurs + cartes sans couleur, la règle couleur/numéro, les groupes de mêmes numéros.
- La hiérarchie `+2 < +4 < +8 < +10`, les combinaisons de pénalités identiques et différentes,
  le calcul automatique et la remise à zéro du compteur.
- Multi-sélection avec surlignage, blocage de la pose et message explicatif.
- Règle UNO, fin de partie avec classement, « Rejouer » / « Quitter ».
- Serveur autoritaire, WebSocket/Socket.IO, `/client` `/server` `/shared`.
- Confidentialité des mains adverses, déconnexion/reconnexion.
- Design moderne, animations, responsive, 100 % graphique original.
- Les 20 tests obligatoires, tous présents et passés.
