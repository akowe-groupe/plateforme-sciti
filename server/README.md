# Serveur — API de la plateforme étudiante SCITI

API REST en Node.js + Express, avec une base PostgreSQL. Le contrat des endpoints est dans
`docs/api.md`, et les choix techniques sont expliqués dans `docs/decisions.md`.

## Prérequis

- Node.js 22 LTS ou plus récent (`node --version`)
- PostgreSQL 14 ou plus récent, démarré en local

## Installation (environ 10 minutes)

```bash
cd server
npm install
```

Crée deux bases vides, l'une pour travailler et l'autre pour les tests :

```bash
createdb sciti
createdb sciti_test
```

Copie le modèle de configuration, puis remplace les valeurs fictives :

```bash
cp .env.example .env
```

Le fichier `.env` reste sur ton ordinateur. Il est ignoré par Git : ne le commite jamais.

## Base de données

```bash
npm run migrate    # crée les tables (src/db/migrations)
npm run seed       # efface puis recrée les données de démonstration fictives
npm run db:reset   # tout supprimer puis tout recréer
```

Après `npm run seed`, tous les comptes de démonstration utilisent le mot de passe défini dans
`SEED_DEMO_PASSWORD`. Ils sont fictifs et leurs adresses se terminent par `@demo.sciti.test`.
Par exemple : `sylvie.hounkpatin@demo.sciti.test` (RP du Bachelor), `paul.dossou@demo.sciti.test`
(professeur présent dans les deux filières) et `kevin.ahouansou@demo.sciti.test`
(super étudiant). `nadege.houngbo@demo.sciti.test` doit changer son mot de passe à la
première connexion.

## Lancement

```bash
npm run dev        # redémarre tout seul à chaque modification
npm start          # lancement simple
```

Vérification : http://localhost:3000/api/health doit répondre
`{"status":"ok","database":"ok"}`.

## Tests

```bash
npm test
```

Les tests utilisent la base indiquée par `DATABASE_URL`. Les tests de contraintes travaillent
dans des transactions annulées à la fin, donc ils ne modifient pas les données de
démonstration. Lance quand même `npm run seed` avant le premier `npm test`.

## Scripts npm

| Script                     | Rôle                                          |
| -------------------------- | --------------------------------------------- |
| `npm run dev`              | Serveur avec redémarrage automatique          |
| `npm start`                | Serveur                                       |
| `npm run migrate`          | Applique les migrations en attente            |
| `npm run migrate:rollback` | Annule le dernier lot de migrations           |
| `npm run seed`             | Recrée les données de démonstration           |
| `npm run db:reset`         | Annule tout, puis migre et recrée les données |
| `npm test`                 | Tests automatisés (`node:test`)               |
| `npm run lint`             | ESLint                                        |
| `npm run format`           | Applique Prettier                             |
| `npm run format:check`     | Vérifie le formatage sans rien modifier       |

## Organisation

```
server/
  src/
    app.js            application Express et middlewares globaux
    server.js         démarrage du serveur
    config/env.js     lecture et validation des variables d'environnement
    db/knex.js        connexion PostgreSQL
    db/migrations/    évolution du schéma, une migration par étape
    db/seeds/         données de démonstration fictives
    middlewares/      gestion centrale des erreurs (puis droits, avec C)
    routes/           un fichier par domaine
    utils/            outils communs (HttpError...)
  tests/              tests automatisés
  docs/               contrat d'API et journal des décisions
```
