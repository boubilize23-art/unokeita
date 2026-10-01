# 🎴 UNO STACK

Jeu de cartes **multijoueur en ligne**, inspiré des jeux de type UNO, avec un moteur de
règles personnalisé : piles de pénalités hiérarchisées **+2 < +4 < +8 < +10**, groupes de
mêmes numéros jouables en une seule action, joker, règle UNO et reconnexion.

**2 à 7 joueurs** · React + Vite · Node.js + Express + Socket.IO · aucune ressource graphique tierce.

---

## 🚀 Démarrage en 30 secondes

```bash
npm install
cp .env.example .env      # optionnel en local
npm run dev
```

Puis ouvrez **http://localhost:5173**.

- `npm run dev` lance **le serveur temps réel (port 3001)** et **le front (port 5173)** en même temps.
- Pour jouer à plusieurs sur le même poste : ouvrez plusieurs onglets, ou un onglet
  en navigation privée (le second joueur rejoignant avec le code de salle).

> Le serveur Socket.IO utilise par défaut `http://<hostname>:3001` en développement.
> En production, renseignez `VITE_WS_URL` (voir [Déploiement](#-déploiement-gratuit)).

## 🧪 Commandes utiles

| Commande | Effet |
|---|---|
| `npm run dev` | serveur + front en mode développement |
| `npm test` | 62 tests (moteur de règles, partie, intégration Socket.IO) |
| `npm run smoke` | joue une **vraie partie** de bout en bout sans navigateur (`SMOKE_PLAYERS=7` pour 7 joueurs) |
| `npm run build` | build de production du front dans `client/dist` |
| `npm start` | démarre uniquement le serveur temps réel |
| `npm run shots` | captures d'écran de l'interface (Playwright, optionnel) |

---

## 🎯 Les règles

### Cartes
4 couleurs (**rouge, jaune, vert, bleu**) + un **joker** sans couleur. 136 cartes :

| Type | Détail |
|---|---|
| Numéros | 1 à 10, 4 couleurs, 2 exemplaires chacun |
| Pénalités | +2, +4, +8, +10 — 4 couleurs, 2 exemplaires chacun |
| Actions | PASS (saute le tour du suivant), RETOUR (inverse le sens) |
| Joker | sans couleur, se joue seul, vous choisissez la couleur |

### Poser une carte
- une carte de **même couleur**, ou
- une carte de **même numéro** (numéros uniquement), ou
- un **joker** (n'importe quand, couleur au choix).

### Groupe de mêmes numéros
Si la main contient plusieurs cartes du **même numéro**, elles peuvent être posées
**en une seule action** — à condition qu'au moins une soit de la couleur active ou que le
numéro corresponde à celui du dessus. Exemple : sur un BLEU 5, poser `ROUGE 5 + JAUNE 5 + VERT 5`.
La couleur qui devient active est choisie par le joueur parmi celles posées.

### Piles de pénalités — le cœur du jeu
Ordre hiérarchique strict :

```
+2  <  +4  <  +8  <  +10
```

- Une pénalité peut toujours être posée : elle ouvre une chaîne.
- Tant qu'une pile est en cours, **seule une pénalité de valeur ≥ à la dernière posée est jouable**.
- Répondre avec une valeur plus faible est **refusé** par le serveur.
- La pile s'additionne : `+2 → +4 → +8` = **14 cartes** à piocher pour celui qui ne peut plus répondre.
- Après la pioche, le compteur **remet à zéro** et le jeu continue.
- Il est possible de poser **plusieurs pénalités en une action** si leur somme respecte
  la hiérarchie : `+2 +4` = +6, `+4 +4` = +8, `+2 +2 +2` = +6, `+8 +8` = +16…

Exemple complet :

```
A joue +2          → pile = 2
B joue +4          → pile = 6
C joue +8          → pile = 14
D n'a pas de +8 ni +10 → pioche 14 cartes, pile = 0
```

### Règle UNO
- Quand il vous reste **une seule carte**, appuyez sur **🔊 UNO !** dans le délai imparti
  (5 s par défaut, réglable par l'hôte).
- Si vous ne criez pas UNO : **pénalité automatique** (2 cartes par défaut).
- Un adversaire à son tour peut aussi vous **signaler** : bouton « 🗣 Signaler UNO ».

### Fin de partie
Le joueur qui pose sa dernière carte gagne. Le classement trie par nombre de cartes restantes,
puis propose **Rejouer** (relance une manche) ou **Quitter la partie**.

### Réglages(modifiables par l'hôte dans le salon)
| Réglage | Défaut |
|---|---|
| Règle UNO obligatoire | oui |
| Cartes par joueur | 7 |
| Pénalité si UNO non crié | 2 cartes |
| Délai pour crier UNO | 5 s |
| Temps de jeu par tour | 45 s (pioche automatique à la fin) |
| Délai si le joueur est **déconnecté** | 8 s (la table ne bloque pas) |
| Durée de conservation d'une place déconnectée | 60 s |
| Cartes max jouées en une action | 5 |

---

## 🏗 Architecture

```
uno-star/
├── shared/          ← moteur de règles PUR, importé par le client ET le serveur
│   ├── constants.js   (couleurs, rangs de pénalité, configuration par défaut)
│   ├── cards.js       (modèle de carte, génération de la pioche)
│   ├── rules.js       ⭐ canPlayCard, canStackPenalty, isValidTurn…
│   └── room.js        (codes de salle, jetons, avatars)
├── server/          ← Node.js + Express + Socket.IO, autoritaire
│   ├── src/app.js       (fabrique du serveur, testable)
│   ├── src/game.js      (une partie : tours, pioches, pénalités, UNO, victoire)
│   ├── src/rooms.js     (plusieurs salles simultanées)
│   └── src/socket.js    (événements : intentions uniquement)
├── client/          ← React + Vite
│   ├── src/pages/       (Home, Lobby, Game)
│   ├── src/components/  (Carte, Siège, Avatar, Sélecteur de couleur, Fin de partie)
│   └── src/lib/         (socket, sons WebAudio générés)
├── api/             ← fonctions Vercel (santé + URL du serveur temps réel)
├── docs/            ← prompt réécrit, analyse, captures
└── scripts/         ← smoke test de partie réelle, captures d'écran
```

**Le serveur est la seule source de vérité.** Le client n'envoie que des intentions
(`game:play` avec des identifiants de cartes) ; le serveur revérifie le tour, la possession
des cartes, toutes les règles, puis diffuse un état **personnalisé** à chaque joueur.

### Fonctions du moteur de règles (section 21 du cahier des charges)

| Fonction | Rôle |
|---|---|
| `canPlayCard(card, ctx)` | une carte unitaire est-elle jouable ? |
| `canPlaySameNumberGroup(cards, ctx)` | groupe de mêmes numéros |
| `canStackPenalty(cards, ctx)` | cumul hiérarchique des pénalités |
| `canPlayMultipleCards(cards, ctx)` | combinaison complète |
| `calculatePenalty(cards)` | somme des pénalités d'un coup |
| `accumulatePenalty(total, cards)` | cumul en cours + seuil de réponse |
| `drawPenalty(pending)` | montant à piocher et remise à zéro |
| `isValidTurn(cards, ctx, color)` | validation d'un tour entier |
| `getPlayableCards(hand, ctx)` | surlignage des cartes jouables |
| `findPlayableGroups(hand, ctx)` | groupes prêts à jouer |
| `canRespondToPenalty(hand, ctx)` | le joueur peut-il répondre à la pile ? |

### Sécurité
- Chaque joueur ne reçoit que **ses propres cartes** ; les autres n'apparaissent que par
  leur **nombre de cartes**, leur nom, leur avatar et leur état de connexion.
- Aucun identifiant de carte adverse ne transite dans les états diffusés.
- Un joueur ne peut pas jouer une carte qu'il ne possède pas, jouer hors de son tour,
  démarrer la partie s'il n'est pas hôte, ou modifier le nombre de cartes de quiconque :
  chaque action est revérifiée côté serveur.

---

## 🚀 Déploiement gratuit

Le jeu a besoin de **deux chose** : un hébergeur de fichiers statiques et un processus
Node qui **reste en mémoire** (les WebSocket ne peuvent pas vivre dans une fonction
serverless). Deux fournisseurs gratuits suffisent.

### 1. Serveur temps réel → Render (gratuit)

`render.yaml` est fourni. Dans Render :

1. **New → Blueprint** → choisir ce dépôt → Render détecte `render.yaml`.
2. Après le premier déploiement, copier l'URL du service
   (ex. `https://uno-stack-realtime.onrender.com`).
3. Dans *Environment*, renseigner `CLIENT_ORIGIN` avec l'URL du front Vercel.

> Le plan gratuit s'endort après 15 min d'inactivité : la première connexion réveille
> le service en quelques secondes (c'est normal, et le client gère la reconnexion).

Autres options équivalentes et gratuites : **Railway**, **Fly.io**, ou un petit VPS.

### 2. Front + API → Vercel (gratuit)

```bash
npm i -g vercel
vercel            # première fois : il détecte vercel.json (build → client/dist)
```

Puis, dans les variables du projet Vercel :

| Variable | Valeur |
|---|---|
| `WS_URL` | `https://uno-stack-realtime.onrender.com` |
| `VITE_WS_URL` | `https://uno-stack-realtime.onrender.com` |

> `VITE_WS_URL` est **compilée au build** : après l'avoir modifiée, relancez un
> déploiement (`vercel --prod`). Si elle est absente, le front appelle `/api` qui lui
> renvoie l'URL configurée côté Vercel.

Vérification : `https://<votre-app>.vercel.app/api` doit renvoyer l'URL du serveur de jeu,
et `https://<votre-app>.vercel.app/api/health` son état.

### En résumé

```
Navigateur ──HTTP──▶ Vercel (front statique + /api)
     │
     └─WebSocket──▶ Render (Node + Socket.IO, état des salles en mémoire)
```

---

## 🧪 Tests

`npm test` exécute **62 tests** répartis en 3 fichiers :

- `shared/test/rules.test.js` — moteur de règles : hiérarchie +2/+4/+8/+10, groupes de mêmes
  numéros, couleurs, jokers, coups invalides, calcul et remise à zéro des pénalités, pioche forcée.
- `server/test/game.test.js` — logique de partie : tours, cumul réel, UNO (annonce, pénalité
  automatique, signalement), victoire et classement, rejouer, déconnexion/reconnexion,
  partie à 7 joueurs, confidentialité des mains.
- `server/test/socket.test.js` — vrais clients contre un vrai serveur : création de salle,
  prêt/démarrage, refus des coups illégaux, reconnexion par jeton, 7 joueurs,
  pile `+2 → +4` puis pioche de 6 cartes.

`npm run smoke` va plus loin : il joue une partie **complète jusqu'au gagnant** avec de
vrais clients Socket.IO et affiche le classement final.

---

## ⚙️ Configuration

Copiez `.env.example` en `.env` :

| Variable | Où | Rôle |
|---|---|---|
| `PORT` | serveur | port HTTP/Socket.IO (3001) |
| `CLIENT_ORIGIN` | serveur | origines autorisées, séparées par des virgules |
| `VITE_WS_URL` | build du front | URL du serveur de jeu vue par le navigateur |
| `WS_URL` | Vercel | URL du serveur de jeu annoncée par `/api` |

## 📄 Documents

- [`docs/PROMPT-FINAL.md`](docs/PROMPT-FINAL.md) — le cahier des charges réécrit (Vercel)
- [`docs/ANALYSE-PROMPT.md`](docs/ANALYSE-PROMPT.md) — ce qu'il faut retirer / améliorer
- `docs/captures/` — captures d'écran (bureau + mobile)
