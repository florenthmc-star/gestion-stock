# HMC Stock

Gestion des stocks des magasins HMC (réceptions, ventes, TLE, prêts, alertes, archives).
Version 9 : l'appli quitte Google Sheets + Apps Script pour Firebase, dans un projet
**séparé** de l'appli HMC (`hmc-stock`, forfait gratuit Spark : 0 € garanti).

Adresse : **https://hmc-stock.web.app**

## Qui peut faire quoi

| Rôle | Voir | Modifier | Archiver un article |
|---|---|---|---|
| ADMIN, DIRECTION, ADV | tous les magasins | tous les magasins | partout |
| DIRECTEUR, RESP_TECH, PLANIFICATEUR | tous les magasins | leur magasin (tous si magasin = ALL) | leur magasin |
| VENDEUR | tous les magasins | leur magasin | seulement une ligne épuisée (quantité 0) |
| COMPTA, RH, compte inactif | aucun accès | — | — |

Rubrique **Historique** (recherche dans tous les articles, même sortis, et dans les archives) :
admin, direction et ADV pour tous les magasins ; un directeur pour son magasin.

Le nettoyage en masse (archives selon le délai choisi) et les paramètres sont réservés à l'admin.
Ces règles sont appliquées par le serveur dans `firestore.rules`, pas seulement par l'écran.

## Organisation du code

- `app/index.html`, `app/src/ecrans.js` : les écrans, repris de l'ancienne appli.
- `app/src/donnees.js` : lecture/écriture Firestore. Remplace l'ancien serveur Apps Script
  avec les mêmes actions (`addArticle`, `adjustQuantity`, `preter`, …).
- `app/src/metier/` : les règles de calcul reprises de `code.gs` (testées dans `tests/`).
- `app/src/admin.js` : liste des administrateurs, recopie des utilisateurs de l'appli HMC,
  export des archives en Excel.
- `firestore.rules` : la sécurité (testée dans `tests/regles/`).

Pour rester gratuit, chaque téléphone garde les articles en mémoire et ne demande au serveur
que ce qui a changé depuis sa dernière visite (champ `majLe` sur chaque article).

## Mise en route (une seule fois)

1. Firebase `hmc-stock` : Authentication → Google activé ; Firestore créé (base `(default)`).
2. Cloud Shell : coller le script de déploiement sans clé (crée le compte `github-deploy`).
3. Ajouter `hmc-stock.web.app` dans les domaines autorisés de l'appli HMC
   (Authentication → Paramètres), pour la recopie des utilisateurs.
4. Créer le premier admin dans Firestore : collection `users`, document = ton email en minuscules,
   champs `role: "ADMIN"`, `magasin: "ALL"`, `actif: true`, `nom: "Flo"`.
5. Fusionner dans `main` : GitHub vérifie puis met en ligne tout seul.
6. Dans l'appli, onglet Paramètres (admin) : « Recopier les utilisateurs de l'appli HMC ».
   (La reprise des données de l'ancienne appli a été faite le 29/10/2026 : 929 articles,
   contrôle identique, et 251 lignes d'archives.)
7. Quand tout est bon : rediriger l'ancienne adresse et couper l'ancien déploiement Apps Script.

Lignes en double dans le Sheet (même ID) : la première ligne est gardée (c'est celle que
l'ancienne appli modifiait), les autres sont rangées dans les archives sous `ID-doublon-n`.

## Développement

```bash
npm install
npm test               # règles métier
npm run test:regles    # règles de sécurité (émulateur, Java nécessaire)
npm run build          # appli dans dist/
```

Essais en local sur les émulateurs :
`VITE_EMULATEURS=1 VITE_FIREBASE_PROJECT_ID=demo-stock npx vite` avec
`npx firebase emulators:start --only auth,firestore --project demo-stock`.

`.env.production` ne contient que la configuration publique des applis web Firebase
(elle est de toute façon visible dans le navigateur) : aucun secret.
