# Contrat d'API — Plateforme étudiante SCITI

Version 1 · 12 novembre 2026 · Chargé back-end (A) · Tâche A-2

Ce document liste tous les endpoints de l'API Express, par domaine, avec les rôles autorisés et
les règles de gestion (RG-xx) du cahier des charges. C'est le contrat partagé avec B : si un
endpoint change, cette fiche change dans la même PR.

Les droits indiqués ici suivent les sections 3 et 4 du cahier des charges. Ils seront alignés
sur la matrice des droits de C (tâche C-1) : en cas d'écart, la matrice C-1 fait foi.

---

## 0. Conventions communes

### 0.1 Base et format

- Préfixe : toutes les routes commencent par `/api`.
- Format : JSON (`Content-Type: application/json`), UTF-8.
- Identifiants : chaînes UUID (`"id": "3f2b..."`), pour qu'on ne puisse pas deviner les autres
  identifiants en ajoutant 1.
- Noms des champs : en anglais, en camelCase (`firstNames`, `startsAt`). Messages d'erreur :
  en français.

### 0.2 Authentification

- Toutes les routes exigent un jeton JWT valide, sauf `POST /api/auth/login` et
  `POST /api/auth/verify-2fa`.
- Transport du jeton : cookie `HttpOnly` posé par le serveur (côté B :
  `credentials: 'include'`). Le choix final revient à C (tâche C-2).
- Tant que `mustChangePassword` vaut `true`, toutes les routes renvoient
  `403 PASSWORD_CHANGE_REQUIRED`, sauf `/api/auth/change-password`, `/api/auth/me` et
  `/api/auth/logout` (RG-06).
- Les droits sont toujours vérifiés par le serveur (RG-08). L'interface peut masquer un
  bouton, mais ce n'est jamais une protection.

### 0.3 Dates et heures

- Réponses : dates en ISO 8601 UTC, par exemple `"2026-11-23T07:00:00Z"`.
- Création ou déplacement d'une séance : B envoie l'heure locale du Bénin
  (`"date": "2026-11-23"`, `"startTime": "08:00"`, `"endTime": "10:00"`). Le serveur la
  convertit en UTC (fuseau `Africa/Porto-Novo`, UTC+1).
- Tous les délais (plage de séance, 15 minutes, 5 minutes) sont calculés avec l'heure du
  serveur, jamais celle de l'appareil (RG-16, RG-34).

### 0.4 Pagination

Les listes longues acceptent `?page=1&pageSize=20` (maximum 100) et renvoient :

```json
{ "items": [], "page": 1, "pageSize": 20, "total": 134 }
```

### 0.5 Format des erreurs

```json
{
  "error": {
    "code": "ATTENDANCE_LOCKED",
    "message": "Le pointage est verrouillé : le délai de 15 minutes est dépassé.",
    "details": []
  }
}
```

`details` n'est rempli que pour les erreurs de validation : liste de
`{ "field": "email", "message": "Adresse e-mail invalide." }`.

| Statut | Code générique             | Quand                                                                  |
| ------ | -------------------------- | ---------------------------------------------------------------------- |
| 400    | `VALIDATION_ERROR`         | Corps ou paramètres refusés par Zod                                    |
| 401    | `UNAUTHENTICATED`          | Pas de jeton, jeton expiré ou invalide                                 |
| 403    | `FORBIDDEN`                | Rôle non autorisé ou ressource hors périmètre (filière, année, module) |
| 403    | `PASSWORD_CHANGE_REQUIRED` | Mot de passe temporaire pas encore changé                              |
| 404    | `NOT_FOUND`                | Ressource inexistante                                                  |
| 409    | voir chaque fiche          | Action impossible dans l'état actuel (verrouillé, déjà saisi...)       |
| 429    | `TOO_MANY_ATTEMPTS`        | Trop de tentatives de connexion ou de code                             |
| 500    | `INTERNAL_ERROR`           | Erreur serveur (message générique, aucun détail interne)               |

### 0.6 Valeurs fixes (ENUM)

| Champ                | Valeurs                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `role`               | `director`, `programHead` (RP), `assistant` (adjoint), `teacher`, `student`              |
| `isSuperStudent`     | `true` / `false` (étudiants seulement)                                                   |
| Présence `value`     | `P`, `A`                                                                                 |
| Note `value`         | `A`, `B`, `F`                                                                            |
| Note `status`        | `entered` (saisie), `published` (publiée)                                                |
| Séance `status`      | `scheduled` (prévue), `moved` (déplacée), `cancelled` (annulée), `confirmed` (confirmée) |
| Inscription `status` | `ongoing` (en cours), `promoted` (passé), `repeating` (redoublant)                       |
| Canal `scope`        | `general`, `program`, `level`                                                            |
| Délégation `type`    | `temporary`, `permanent`                                                                 |
| Notification `type`  | `SESSION_MOVED`, `SESSION_CANCELLED`, `YEAR_DECISION`                                    |

### 0.7 Objets renvoyés souvent

```json
// User
{ "id": "...", "lastName": "HOUNSOU", "firstNames": "Afiwa Grâce", "email": "...",
  "phone": "...", "role": "student", "programId": "...", "isSuperStudent": false,
  "mustChangePassword": false }

// Session (séance)
{ "id": "...", "moduleId": "...", "moduleName": "Bases de données",
  "teacherId": "...", "teacherName": "DOSSOU Paul", "levelId": "...",
  "startsAt": "2026-11-23T07:00:00Z", "endsAt": "2026-11-23T09:00:00Z",
  "status": "scheduled", "confirmedAt": null }
```

---

## 1. Endpoints par profil

Légende : ✓ = autorisé · **F** = limité à sa filière · **M** = limité à ses modules
(affectations) · **Soi** = ses propres données · — = interdit.

| #   | Endpoint                                                             | Dir.   | RP             | Adj.        | Prof.                   | Étu. | Super étu.     |
| --- | -------------------------------------------------------------------- | ------ | -------------- | ----------- | ----------------------- | ---- | -------------- |
| 1   | `POST /api/auth/login`                                               | ✓      | ✓              | ✓           | ✓                       | ✓    | ✓              |
| 2   | `POST /api/auth/verify-2fa`                                          | ✓      | ✓              | ✓           | —                       | —    | —              |
| 3   | `POST /api/auth/change-password`                                     | ✓      | ✓              | ✓           | ✓                       | ✓    | ✓              |
| 4   | `POST /api/auth/logout`                                              | ✓      | ✓              | ✓           | ✓                       | ✓    | ✓              |
| 5   | `GET /api/auth/me`                                                   | ✓      | ✓              | ✓           | ✓                       | ✓    | ✓              |
| 6   | `GET /api/me/dashboard`                                              | —      | —              | —           | —                       | Soi  | Soi            |
| 7   | `GET /api/me/modules`                                                | —      | —              | —           | —                       | Soi  | Soi            |
| 8   | `GET /api/me/grades`                                                 | —      | —              | —           | —                       | Soi  | Soi            |
| 9   | `GET /api/me/attendance`                                             | —      | —              | —           | —                       | Soi  | Soi            |
| 10  | `GET /api/me/enrollments`                                            | —      | —              | —           | —                       | Soi  | Soi            |
| 11  | `GET /api/me/assignments`                                            | —      | —              | —           | Soi                     | —    | —              |
| 12  | `GET /api/accounts`                                                  | ✓      | F              | F           | —                       | —    | —              |
| 13  | `POST /api/accounts/students`                                        | ✓      | F              | F           | —                       | —    | —              |
| 14  | `GET /api/accounts/teachers/search`                                  | ✓      | ✓              | ✓           | —                       | —    | —              |
| 15  | `POST /api/accounts/teachers`                                        | ✓      | F              | F           | —                       | —    | —              |
| 16  | `POST /api/accounts/teachers/:teacherId/assignments`                 | ✓      | F              | F           | —                       | —    | —              |
| 17  | `DELETE /api/accounts/teachers/:teacherId/assignments/:assignmentId` | ✓      | F              | F           | —                       | —    | —              |
| 18  | `POST /api/accounts/program-heads`                                   | ✓      | —              | —           | —                       | —    | —              |
| 19  | `POST /api/accounts/assistants`                                      | ✓      | F              | —           | —                       | —    | —              |
| 20  | `PATCH /api/accounts/students/:studentId/super-student`              | ✓      | F              | F           | —                       | —    | —              |
| 21  | `POST /api/accounts/:userId/reset-password`                          | ✓      | F              | F           | —                       | —    | —              |
| 22  | `POST /api/accounts/students/:studentId/year-decision`               | ✓      | F              | F           | —                       | —    | —              |
| 23  | `GET /api/structure/programs`                                        | ✓      | F              | F           | M                       | Soi  | Soi            |
| 24  | `POST /api/structure/programs`                                       | ✓      | —              | —           | —                       | —    | —              |
| 25  | `POST /api/structure/programs/:programId/levels`                     | ✓      | F              | F           | —                       | —    | —              |
| 26  | `GET /api/structure/levels/:levelId`                                 | ✓      | F              | F           | M                       | Soi  | Soi            |
| 27  | `PATCH /api/structure/levels/:levelId/current-semester`              | ✓      | F              | F           | —                       | —    | —              |
| 28  | `POST /api/structure/semesters/:semesterId/modules`                  | ✓      | F              | F           | —                       | —    | —              |
| 29  | `PATCH /api/structure/modules/:moduleId`                             | ✓      | F              | F           | —                       | —    | —              |
| 30  | `DELETE /api/structure/modules/:moduleId`                            | ✓      | F              | F           | —                       | —    | —              |
| 31  | `GET /api/structure/modules/:moduleId/students`                      | ✓      | F              | F           | M                       | —    | —              |
| 32  | `GET /api/schedule/sessions`                                         | ✓      | F              | F           | M                       | Soi  | Soi            |
| 33  | `POST /api/schedule/sessions`                                        | ✓      | F              | F           | —                       | —    | —              |
| 34  | `PATCH /api/schedule/sessions/:sessionId`                            | ✓      | F              | F           | —                       | —    | —              |
| 35  | `POST /api/schedule/sessions/:sessionId/move`                        | ✓      | F              | F           | —                       | —    | —              |
| 36  | `POST /api/schedule/sessions/:sessionId/cancel`                      | ✓      | F              | F           | —                       | —    | —              |
| 37  | `PUT /api/schedule/sessions/:sessionId/confirmation`                 | ✓      | F              | F           | M (confirmer seulement) | —    | —              |
| 38  | `GET /api/attendance/sessions/:sessionId`                            | ✓      | F              | F           | M                       | —    | —              |
| 39  | `POST /api/attendance/sessions/:sessionId`                           | —      | —              | —           | M                       | —    | —              |
| 40  | `PATCH /api/attendance/sessions/:sessionId`                          | —      | —              | —           | M                       | —    | —              |
| 41  | `GET /api/attendance/levels/:levelId/summary`                        | ✓      | F              | F           | M                       | —    | —              |
| 42  | `GET /api/grades/modules/:moduleId`                                  | ✓      | F              | F           | M                       | —    | —              |
| 43  | `POST /api/grades/modules/:moduleId`                                 | —      | —              | —           | M                       | —    | —              |
| 44  | `GET /api/grades/levels/:levelId`                                    | ✓      | F              | F           | —                       | —    | —              |
| 45  | `PATCH /api/grades/:gradeId`                                         | ✓      | F + délégation | —           | —                       | —    | —              |
| 46  | `GET /api/grades/:gradeId/history`                                   | ✓      | F              | F           | —                       | —    | —              |
| 47  | `POST /api/grades/publications`                                      | ✓      | F              | F           | —                       | —    | —              |
| 48  | `POST /api/grades/delegations`                                       | ✓      | —              | —           | —                       | —    | —              |
| 49  | `GET /api/grades/delegations`                                        | ✓      | —              | —           | —                       | —    | —              |
| 50  | `DELETE /api/grades/delegations/:delegationId`                       | ✓      | —              | —           | —                       | —    | —              |
| 51  | `GET /api/channels`                                                  | ✓      | ✓              | ✓           | ✓                       | ✓    | ✓              |
| 52  | `GET /api/channels/feed`                                             | ✓      | ✓              | ✓           | ✓                       | ✓    | ✓              |
| 53  | `GET /api/channels/:channelId/posts`                                 | ✓      | ✓              | ✓           | ✓                       | ✓    | ✓              |
| 54  | `POST /api/channels/:channelId/posts`                                | ✓      | F + général    | F + général | M                       | —    | ✓ (voir RG-31) |
| 55  | `PATCH /api/channels/:channelId/posts/:postId`                       | auteur | auteur         | auteur      | auteur                  | —    | auteur         |
| 56  | `PATCH /api/channels/:channelId/posts/:postId/visibility`            | ✓      | F              | F           | —                       | —    | —              |
| 57  | `DELETE /api/channels/:channelId/posts/:postId`                      | ✓      | F              | F           | —                       | —    | —              |
| 58  | `GET /api/notifications`                                             | Soi    | Soi            | Soi         | Soi                     | Soi  | Soi            |
| 59  | `PATCH /api/notifications/:notificationId/read`                      | Soi    | Soi            | Soi         | Soi                     | Soi  | Soi            |
| 60  | `POST /api/notifications/read-all`                                   | Soi    | Soi            | Soi         | Soi                     | Soi  | Soi            |
| 61  | `GET /api/overview`                                                  | ✓      | F              | F           | —                       | —    | —              |

Ordre de livraison prévu : authentification (avec C) et comptes en A-5, structure en A-6 et
séances en A-7, au sprint 2. Puis, au sprint 3 : présences (A-9), notes (A-10), heures restantes
(A-11), canaux (A-12), notifications et passage d'année (A-13).

---

## 2. Authentification — `/api/auth`

Tâches C-4 et C-6 (C avec A). Sprint 2.

### POST /api/auth/login

- Objectif : connecter un utilisateur.
- Rôles autorisés : tous (route publique, limitée par `express-rate-limit`).
- Règles de gestion : RG-01, RG-06, RG-07.
- Corps de la requête : `{ email, password, adminCode? }`. `adminCode` est obligatoire pour
  les directeurs, RP et adjoints.
- Réponse 200 (étudiant, professeur) : `{ user, mustChangePassword }` + cookie de session.
- Réponse 200 (directeur, RP, adjoint) : `{ twoFactorRequired: true, challengeId }`. Un code
  est envoyé par e-mail. Aucun jeton n'est encore donné.
- Erreurs : 400 (format invalide), 401 `INVALID_CREDENTIALS` (message unique : « E-mail,
  mot de passe ou code administrateur incorrect. », sans dire lequel est faux), 429.

### POST /api/auth/verify-2fa

- Objectif : valider le code de double vérification reçu par e-mail.
- Rôles autorisés : directeur, RP, adjoint (après `login`).
- Règles de gestion : RG-07.
- Corps de la requête : `{ challengeId, code }`.
- Réponse 200 : `{ user, mustChangePassword }` + cookie de session.
- Erreurs : 400, 401 `INVALID_2FA_CODE` (code faux ou expiré), 429 (nombre d'essais dépassé :
  il faut se reconnecter).

### POST /api/auth/change-password

- Objectif : changer son mot de passe, obligatoire à la première connexion.
- Rôles autorisés : tout utilisateur connecté.
- Règles de gestion : RG-06 ; user story E1.
- Corps de la requête : `{ currentPassword, newPassword }`. La règle de robustesse de
  `newPassword` sera fixée par C.
- Réponse 200 : `{ user }` avec `mustChangePassword: false`.
- Erreurs : 400 (mot de passe trop faible, ou identique à l'ancien), 401 (`currentPassword`
  incorrect).

### POST /api/auth/logout

- Objectif : se déconnecter (le cookie de session est effacé).
- Rôles autorisés : tout utilisateur connecté.
- Corps de la requête : aucun.
- Réponse 204 : aucun contenu.

### GET /api/auth/me

- Objectif : donner à B le profil et le périmètre de l'utilisateur, pour construire la
  navigation par rôle (B-2).
- Rôles autorisés : tout utilisateur connecté.
- Réponse 200 :

```json
{
  "user": { "...": "objet User" },
  "scope": {
    "programId": "...",
    "levelId": "...",
    "assignments": [
      { "id": "...", "moduleId": "...", "moduleName": "...", "programId": "...", "levelId": "..." }
    ],
    "canCorrectGrades": false,
    "delegationEndsAt": null
  }
}
```

`levelId` concerne les étudiants, `assignments` les professeurs, `canCorrectGrades` les
directeurs et les RP délégués.

- Erreurs : 401.

---

## 3. Espace personnel — `/api/me`

Ces routes ne prennent **jamais** d'identifiant d'étudiant en paramètre. Le serveur utilise
l'identifiant contenu dans le jeton. Un étudiant ne peut donc pas lire les données d'un autre
(règle technique n° 2 du guide).

### GET /api/me/dashboard

- Objectif : tout le tableau de bord de l'étudiant en une seule requête, ce qui aide avec
  une connexion lente.
- Rôles autorisés : étudiant, super étudiant.
- Règles de gestion : RG-27 ; user stories E3 et E5.
- Réponse 200 : `{ currentSemester: { id, number }, modules: [...comme /me/modules],
latestPosts: [5 dernières publications], unreadNotifications: 3 }`.
- Erreurs : 401, 403.
- Tâche : A-11 (sprint 3).

### GET /api/me/modules

- Objectif : modules du semestre en cours avec leurs heures restantes.
- Rôles autorisés : étudiant, super étudiant.
- Règles de gestion : RG-26, RG-27, RG-28.
- Réponse 200 :

```json
{
  "semester": { "id": "...", "number": 1 },
  "modules": [
    {
      "id": "...",
      "name": "Bases de données",
      "totalHours": 30,
      "confirmedHours": 12,
      "remainingHours": 18
    }
  ]
}
```

`remainingHours` = volume horaire total − somme des durées des séances confirmées. Les
séances annulées ne comptent pas. Le calcul est fait dans PostgreSQL.

- Erreurs : 401, 403.
- Tâche : A-11.

### GET /api/me/grades

- Objectif : notes publiées de l'étudiant, par année, semestre et module.
- Rôles autorisés : étudiant, super étudiant.
- Règles de gestion : RG-20, RG-24, RG-25, RG-38.
- Paramètres de requête : `levelId` (optionnel, une année précédente ; par défaut l'année en
  cours).
- Réponse 200 :

```json
{
  "level": {
    "id": "...",
    "number": 2,
    "programName": "Bachelor Digitalisation et Science des données"
  },
  "semesters": [
    { "number": 1, "modules": [{ "moduleId": "...", "moduleName": "...", "value": "A" }] }
  ]
}
```

Seules les notes au statut `published` sont renvoyées. Un module sans note publiée
n'apparaît pas.

- Erreurs : 401, 403 (`levelId` qui n'est pas une inscription de l'étudiant).
- Tâche : A-10.

### GET /api/me/attendance

- Objectif : présences de l'étudiant, avec totaux et pourcentages.
- Rôles autorisés : étudiant, super étudiant.
- Règles de gestion : RG-18, RG-19 ; décision validée n° 3 (calcul sur les séances
  confirmées).
- Paramètres de requête : `levelId` (optionnel), `semesterNumber` (optionnel).
- Réponse 200 :

```json
{
  "global": { "confirmedSessions": 40, "absences": 3, "attendanceRate": 92.5 },
  "modules": [
    {
      "moduleId": "...",
      "moduleName": "...",
      "confirmedSessions": 8,
      "absences": 1,
      "attendanceRate": 87.5,
      "sessions": [{ "sessionId": "...", "startsAt": "...", "value": "P" }]
    }
  ]
}
```

- Erreurs : 401, 403.
- Tâche : A-11.

### GET /api/me/enrollments

- Objectif : liste des années suivies par l'étudiant (historique).
- Rôles autorisés : étudiant, super étudiant.
- Règles de gestion : RG-11, RG-38 ; user story E8 (priorité S).
- Réponse 200 : `{ items: [ { levelId, programName, levelNumber, cohort, status } ] }`.
- Erreurs : 401, 403.
- Tâche : A-13.

### GET /api/me/assignments

- Objectif : modules du professeur, avec leur filière et leur année.
- Rôles autorisés : professeur.
- Règles de gestion : RG-03, RG-04 ; user story P1.
- Réponse 200 : `{ items: [ { assignmentId, moduleId, moduleName, programId, programName,
levelId, levelNumber, semesterNumber, studentCount } ] }`.
- Erreurs : 401, 403.
- Tâche : A-5.

---

## 4. Comptes — `/api/accounts`

Tâche A-5 (sprint 2). Règles RG-02 à RG-06 et RG-10.

### GET /api/accounts

- Objectif : lister les comptes de son périmètre.
- Rôles autorisés : directeur (toutes les filières) ; RP et adjoint (leur filière).
- Règles de gestion : RG-08, RG-10.
- Paramètres de requête : `role`, `programId`, `levelId`, `search` (nom ou e-mail), `page`,
  `pageSize`.
- Réponse 200 : liste paginée d'objets `User`.
- Erreurs : 400, 401, 403 (`programId` hors filière).

### POST /api/accounts/students

- Objectif : créer le compte d'un étudiant et l'inscrire dans une année.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-01, RG-02, RG-06, RG-11.
- Corps de la requête : `{ lastName, firstNames, email, phone, levelId }`.
- Réponse 201 : `{ user, temporaryPassword }`. Le mot de passe temporaire est généré au
  hasard et **n'apparaît qu'une fois**, dans cette réponse. Il n'est jamais renvoyé ensuite.
- Erreurs : 400, 401, 403 (année d'une autre filière), 409 `EMAIL_ALREADY_USED`.

### GET /api/accounts/teachers/search

- Objectif : avant de créer un professeur, vérifier s'il existe déjà dans une autre filière.
- Rôles autorisés : directeur, RP, adjoint.
- Règles de gestion : RG-04 ; décision validée n° 5.
- Paramètres de requête : `lastName`, `firstNames` (obligatoires).
- Réponse 200 : `{ items: [ { id, lastName, firstNames, programs: ["Master ..."] } ] }`.
  Pas d'e-mail ni de téléphone ici : le minimum pour reconnaître la personne.
- Erreurs : 400, 401, 403.

### POST /api/accounts/teachers

- Objectif : créer un professeur, ou lier un professeur existant à sa filière.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-03, RG-04, RG-06.
- Corps de la requête, deux cas :
  - nouveau professeur : `{ lastName, firstNames, email, phone, moduleIds: [...] }` ;
  - professeur existant (trouvé par `search`) : `{ existingTeacherId, moduleIds: [...] }`.
- Réponse 201 : `{ user, linked, assignments: [...], temporaryPassword }`.
  `temporaryPassword` vaut `null` si le compte est lié, car la personne garde son mot de
  passe. `linked` vaut `true` dans ce cas.
- Erreurs : 400, 401, 403 (module d'une autre filière), 409 `EMAIL_ALREADY_USED`.

### POST /api/accounts/teachers/:teacherId/assignments

- Objectif : affecter un professeur à un module supplémentaire.
- Rôles autorisés : directeur ; RP et adjoint de la filière du module.
- Règles de gestion : RG-03, RG-12.
- Corps de la requête : `{ moduleId }`.
- Réponse 201 : `{ assignmentId, moduleId, programId, levelId }`.
- Erreurs : 400, 401, 403, 404, 409 `ALREADY_ASSIGNED`.

### DELETE /api/accounts/teachers/:teacherId/assignments/:assignmentId

- Objectif : retirer une affectation.
- Rôles autorisés : directeur ; RP et adjoint de la filière du module.
- Règles de gestion : RG-12.
- Réponse 204 : aucun contenu.
- Erreurs : 401, 403, 404, 409 `ASSIGNMENT_IN_USE` (des séances futures utilisent encore ce
  professeur sur ce module : il faut d'abord les réaffecter).

### POST /api/accounts/program-heads

- Objectif : créer le compte d'un responsable pédagogique.
- Rôles autorisés : directeur.
- Règles de gestion : RG-05, RG-06, RG-07.
- Corps de la requête : `{ lastName, firstNames, email, phone, programId }`.
- Réponse 201 : `{ user, temporaryPassword, adminCode }`. Le mot de passe temporaire et
  l'identifiant spécial ne sont affichés qu'une fois.
- Erreurs : 400, 401, 403, 409 `EMAIL_ALREADY_USED`.

### POST /api/accounts/assistants

- Objectif : nommer un adjoint dans une filière.
- Rôles autorisés : directeur ; RP de la filière. **Un adjoint ne peut pas nommer
  d'adjoint.**
- Règles de gestion : RG-05, RG-06, RG-07 ; décision validée n° 4.
- Corps de la requête : `{ lastName, firstNames, email, phone, programId }`.
- Réponse 201 : `{ user, temporaryPassword, adminCode }` (affichés une seule fois).
- Erreurs : 400, 401, 403 (adjoint, ou autre filière), 409 `EMAIL_ALREADY_USED`.

### PATCH /api/accounts/students/:studentId/super-student

- Objectif : nommer un super étudiant ou lui retirer ce droit.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-31 ; user story R9.
- Corps de la requête : `{ isSuperStudent: true | false }`.
- Réponse 200 : `{ user }`.
- Erreurs : 400, 401, 403, 404.

### POST /api/accounts/:userId/reset-password

- Objectif : générer un nouveau mot de passe temporaire.
- Rôles autorisés : directeur ; RP et adjoint pour les comptes de leur filière.
- Règles de gestion : RG-06 ; user story R12 (priorité S).
- Corps de la requête : aucun.
- Réponse 200 : `{ temporaryPassword }` (affiché une seule fois ; `mustChangePassword`
  repasse à `true`).
- Erreurs : 401, 403, 404.

### POST /api/accounts/students/:studentId/year-decision

- Objectif : enregistrer la décision de passage ou de redoublement et prévenir l'étudiant.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-11, RG-36, RG-37, RG-38.
- Corps de la requête : `{ decision: "promoted" | "repeating", nextLevelId, message? }`.
  `nextLevelId` est choisi librement par le RP : la plateforme n'applique aucune règle
  automatique (RG-37).
- Effet, en une seule transaction : l'inscription en cours passe à `promoted` ou
  `repeating` ; une nouvelle inscription `ongoing` est créée dans `nextLevelId` ; une
  notification `YEAR_DECISION` est envoyée à l'étudiant. L'ancienne inscription est gardée
  (historique, RG-38).
- Réponse 201 : `{ previousEnrollment, newEnrollment, notificationId }`.
- Erreurs : 400, 401, 403, 404, 409 `NO_ONGOING_ENROLLMENT`.
- Tâche : A-13.

---

## 5. Structure académique — `/api/structure`

Tâche A-6 (sprint 2). Règles RG-09, RG-10, RG-26 et RG-29. Ajouter une filière, une année ou une
cohorte se fait en ajoutant des lignes, jamais en modifiant le schéma.

### GET /api/structure/programs

- Objectif : filières avec leurs années.
- Rôles autorisés : tous. Le résultat est filtré par périmètre : un étudiant ne voit que
  sa filière, un professeur les filières de ses affectations.
- Réponse 200 : `{ items: [ { id, name, durationYears, levels: [ { id, number, cohort,
currentSemesterNumber } ] } ] }`.
- Erreurs : 401.

### POST /api/structure/programs

- Objectif : créer une filière. Le canal de la filière est créé automatiquement (RG-30).
- Rôles autorisés : directeur.
- Règles de gestion : RG-09.
- Corps de la requête : `{ name, durationYears }`.
- Réponse 201 : `{ program, channelId }`.
- Erreurs : 400, 401, 403, 409 `PROGRAM_NAME_TAKEN`.

### POST /api/structure/programs/:programId/levels

- Objectif : créer une année (niveau + cohorte). Le serveur crée aussi ses 2 semestres (le
  semestre 1 actif) et le sous-canal de l'année.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-09, RG-30.
- Corps de la requête : `{ number, cohort }`, par exemple `{ "number": 1, "cohort": "2026-2027" }`.
- Réponse 201 : `{ level, semesters: [ {id, number: 1, active: true}, {id, number: 2,
active: false} ], channelId }`.
- Erreurs : 400 (`number` supérieur à la durée de la filière), 401, 403, 409
  `LEVEL_ALREADY_EXISTS`.

### GET /api/structure/levels/:levelId

- Objectif : détail d'une année : semestres, modules, professeurs affectés.
- Rôles autorisés : directeur ; RP et adjoint de la filière ; professeur affecté à un module
  de cette année ; étudiant inscrit dans cette année.
- Réponse 200 : `{ level, semesters: [ { id, number, active, modules: [ { id, name,
totalHours, teachers: [ {id, name} ] } ] } ] }`.
- Erreurs : 401, 403, 404.

### PATCH /api/structure/levels/:levelId/current-semester

- Objectif : indiquer le semestre en cours, ou passer au second semestre.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-26, RG-29.
- Corps de la requête : `{ semesterNumber: 1 | 2 }`.
- Réponse 200 : `{ levelId, currentSemesterNumber }`. Un seul semestre est actif à la fois
  (changement fait dans une transaction).
- Erreurs : 400, 401, 403, 404.

### POST /api/structure/semesters/:semesterId/modules

- Objectif : ajouter un module à un semestre, avec son volume horaire.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-09, RG-26.
- Corps de la requête : `{ name, totalHours }`.
- Réponse 201 : `{ module }`.
- Erreurs : 400, 401, 403, 404, 409 `MODULE_NAME_TAKEN` (même nom dans le même semestre).

### PATCH /api/structure/modules/:moduleId

- Objectif : modifier le nom ou le volume horaire d'un module.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-12, RG-26.
- Corps de la requête : `{ name?, totalHours? }`.
- Réponse 200 : `{ module }`.
- Erreurs : 400 (`totalHours` inférieur aux heures déjà confirmées), 401, 403, 404.

### DELETE /api/structure/modules/:moduleId

- Objectif : supprimer un module créé par erreur.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Réponse 204 : aucun contenu.
- Erreurs : 401, 403, 404, 409 `MODULE_IN_USE` (le module a déjà des séances, des présences ou
  des notes : on ne supprime pas l'historique).

### GET /api/structure/modules/:moduleId/students

- Objectif : étudiants qui suivent un module (inscrits dans l'année du module).
- Rôles autorisés : directeur ; RP et adjoint de la filière ; professeur affecté au module.
- Règles de gestion : RG-10 ; user story P1.
- Paramètres de requête : `page`, `pageSize`.
- Réponse 200 : liste paginée de `{ id, lastName, firstNames }`. Pas d'e-mail ni de
  téléphone pour le professeur.
- Erreurs : 401, 403, 404.

---

## 6. Emploi du temps et séances — `/api/schedule`

Tâche A-7 (sprint 2). Règles RG-12 à RG-14 et RG-28.

### GET /api/schedule/sessions

- Objectif : séances sur une période (emploi du temps).
- Rôles autorisés : tous, filtré par le serveur : étudiant = séances de son année ;
  professeur = ses séances ; RP et adjoint = leur filière ; directeur = tout.
- Paramètres de requête : `from`, `to` (dates `YYYY-MM-DD`, obligatoires, 31 jours maximum),
  `levelId`, `moduleId`, `teacherId`, `status`.
- Réponse 200 : `{ items: [Session] }`.
- Erreurs : 400, 401, 403 (filtre hors périmètre).

### POST /api/schedule/sessions

- Objectif : créer une séance datée.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-12, RG-13.
- Corps de la requête : `{ moduleId, teacherId, date, startTime, endTime }` (heure du
  Bénin, voir 0.3).
- Réponse 201 : `{ session }` avec `status: "scheduled"`.
- Erreurs : 400 (`endTime` avant `startTime`), 401, 403, 404, 409 `TEACHER_NOT_ASSIGNED`
  (le professeur n'est pas affecté à ce module), 409 `TEACHER_TIME_CONFLICT` (le professeur a
  déjà une séance qui chevauche).

### PATCH /api/schedule/sessions/:sessionId

- Objectif : changer le professeur d'une séance future.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-12.
- Corps de la requête : `{ teacherId }`.
- Réponse 200 : `{ session }`.
- Erreurs : 400, 401, 403, 404, 409 `TEACHER_NOT_ASSIGNED`, 409 `SESSION_NOT_EDITABLE`
  (séance annulée, confirmée ou déjà commencée).

### POST /api/schedule/sessions/:sessionId/move

- Objectif : déplacer une séance (par exemple du lundi au jeudi soir).
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-13, RG-14.
- Corps de la requête : `{ date, startTime, endTime, reason? }`.
- Effet, en une transaction : nouvelles heures, `status: "moved"`, une notification
  `SESSION_MOVED` pour chaque étudiant de l'année et pour le professeur.
- Réponse 200 : `{ session, notifiedCount }`.
- Erreurs : 400, 401, 403, 404, 409 `SESSION_NOT_EDITABLE`, 409 `TEACHER_TIME_CONFLICT`.

### POST /api/schedule/sessions/:sessionId/cancel

- Objectif : annuler une séance.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-13, RG-14, RG-28 (une séance annulée n'est pas décomptée).
- Corps de la requête : `{ reason? }`.
- Effet, en une transaction : `status: "cancelled"`, une notification `SESSION_CANCELLED`
  pour les étudiants et le professeur.
- Réponse 200 : `{ session, notifiedCount }`.
- Erreurs : 401, 403, 404, 409 `SESSION_NOT_EDITABLE` (déjà annulée ou confirmée).

### PUT /api/schedule/sessions/:sessionId/confirmation

- Objectif : confirmer qu'un cours a eu lieu (décompte des heures), ou corriger cette
  confirmation.
- Rôles autorisés :
  - professeur de la séance : `confirmed: true` seulement (user story P5) ;
  - directeur, RP et adjoint de la filière : `true` ou `false` (correction, R11).
- Règles de gestion : RG-28 ; décision validée n° 6 (heures décomptées = durée de la séance).
- Corps de la requête : `{ confirmed: true | false }`.
- Réponse 200 : `{ session }`. Avec `true` : `status: "confirmed"` et `confirmedAt` rempli.
  Avec `false` : la séance revient à `scheduled` ou `moved`.
- Erreurs : 400, 401, 403 (professeur qui envoie `false`, ou séance d'un autre professeur),
  404, 409 `SESSION_CANCELLED`, 409 `SESSION_NOT_STARTED` (confirmation avant l'heure de
  début, selon l'heure du serveur).

---

## 7. Présences — `/api/attendance`

Tâches A-9 et A-11 (sprint 3). Règles RG-15 à RG-19.

### GET /api/attendance/sessions/:sessionId

- Objectif : feuille de présence d'une séance (écran de pointage).
- Rôles autorisés : professeur de la séance ; directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-15, RG-16.
- Réponse 200 :

```json
{
  "session": { "...": "objet Session" },
  "validatedAt": null,
  "lockedAt": null,
  "canValidate": true,
  "canCorrect": false,
  "students": [{ "studentId": "...", "lastName": "...", "firstNames": "...", "value": null }]
}
```

`canValidate` et `canCorrect` sont calculés par le serveur. B s'en sert pour afficher les
boutons, mais le serveur revérifie au moment du POST ou du PATCH.

- Erreurs : 401, 403, 404.

### POST /api/attendance/sessions/:sessionId

- Objectif : enregistrer le pointage d'une séance.
- Rôles autorisés : professeur affecté au module. Le directeur ne pointe pas (section 3 du
  cahier des charges).
- Règles de gestion : RG-15, RG-16, RG-17.
- Corps de la requête : `{ students: [{ studentId, value: 'P' | 'A' }] }`. Chaque étudiant
  inscrit doit apparaître une fois.
- Réponse 200 : `{ sessionId, validatedAt, records: [...] }`. `validatedAt` est l'heure du
  serveur.
- Erreurs : 400 (valeur invalide, étudiant manquant ou non inscrit), 401 (non connecté), 403
  (hors périmètre ou hors plage horaire), 409 `ATTENDANCE_ALREADY_VALIDATED` (utiliser
  PATCH), 409 `SESSION_CANCELLED`.

### PATCH /api/attendance/sessions/:sessionId

- Objectif : corriger le pointage dans les 15 minutes qui suivent la validation.
- Rôles autorisés : professeur affecté au module.
- Règles de gestion : RG-15, RG-16, RG-17.
- Corps de la requête : `{ students: [{ studentId, value: 'P' | 'A' }] }`. On peut n'envoyer
  que les lignes modifiées.
- Conditions vérifiées avec l'heure du serveur : moins de 15 minutes depuis `validatedAt`, et
  séance pas encore terminée. Le délai de 15 minutes repart toujours de la **première**
  validation : une correction ne le relance pas.
- Réponse 200 : `{ sessionId, validatedAt, records: [...] }`.
- Erreurs : 400, 401, 403 (hors périmètre ou hors plage), 404, 409 `ATTENDANCE_LOCKED`
  (pointage verrouillé : un étudiant arrivé en retard reste absent, RG-17), 409
  `ATTENDANCE_NOT_VALIDATED` (utiliser POST d'abord).

### GET /api/attendance/levels/:levelId/summary

- Objectif : assiduité des étudiants d'une année (suivi par le RP, le directeur ou le
  professeur).
- Rôles autorisés : directeur ; RP et adjoint de la filière ; professeur (avec `moduleId`
  obligatoire, sur ses modules).
- Règles de gestion : RG-19 ; user story D1.
- Paramètres de requête : `moduleId`, `semesterNumber`, `page`, `pageSize`.
- Réponse 200 : liste paginée de `{ studentId, lastName, firstNames, confirmedSessions,
absences, attendanceRate }`.
- Erreurs : 400, 401, 403, 404.

---

## 8. Notes — `/api/grades`

Tâche A-10 (sprint 3). Règles RG-20 à RG-25.

### GET /api/grades/modules/:moduleId

- Objectif : notes d'un module (écran de saisie du professeur, suivi du RP).
- Rôles autorisés : professeur affecté ; directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-20, RG-21 ; user story R6.
- Réponse 200 : `{ module, students: [ { studentId, lastName, firstNames, gradeId, value,
status, enteredAt } ] }`. `value` vaut `null` si la note n'est pas encore saisie.
- Erreurs : 401, 403, 404.

### POST /api/grades/modules/:moduleId

- Objectif : saisir les notes d'un module.
- Rôles autorisés : professeur affecté au module.
- Règles de gestion : RG-20, RG-21.
- Corps de la requête : `{ grades: [ { studentId, value: 'A' | 'B' | 'F' } ] }`. La saisie
  peut se faire en plusieurs fois (quelques étudiants à la fois).
- Réponse 201 : `{ created: [ { gradeId, studentId, value, status: "entered" } ] }`.
- Erreurs : 400 (valeur hors A/B/F, étudiant non inscrit), 401, 403, 404, 409
  `GRADE_ALREADY_ENTERED` (une note existe déjà : le professeur ne peut plus la modifier ;
  la liste des étudiants concernés est dans `details`). Rien n'est enregistré si une seule
  ligne est refusée.

### GET /api/grades/levels/:levelId

- Objectif : tableau des résultats d'une année (étudiants × modules).
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : user stories R6 et D1.
- Paramètres de requête : `semesterNumber`, `page`, `pageSize`.
- Réponse 200 : `{ modules: [ {id, name} ], students: [ { studentId, lastName, firstNames,
grades: { "<moduleId>": { gradeId, value, status } } } ], total }`.
- Erreurs : 401, 403, 404.

### PATCH /api/grades/:gradeId

- Objectif : corriger une note, avec une trace.
- Rôles autorisés : directeur ; RP de la filière **avec une délégation active** à la date du
  serveur.
- Règles de gestion : RG-21, RG-22, RG-23.
- Corps de la requête : `{ value: 'A' | 'B' | 'F', reason }` (`reason` obligatoire, non
  vide).
- Effet, en une transaction : la note change, et une ligne d'historique est écrite (ancienne
  note, nouvelle note, auteur, date du serveur, motif). Soit les deux réussissent, soit aucune.
- Réponse 200 : `{ grade, history: { oldValue, newValue, authorName, createdAt, reason } }`.
- Erreurs : 400 (motif absent, ou nouvelle note identique à l'ancienne), 401, 403
  `NO_ACTIVE_DELEGATION`, 404.

### GET /api/grades/:gradeId/history

- Objectif : historique des corrections d'une note.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-23.
- Réponse 200 : `{ items: [ { oldValue, newValue, authorName, createdAt, reason } ] }`, du
  plus récent au plus ancien.
- Erreurs : 401, 403, 404.

### POST /api/grades/publications

- Objectif : publier les notes d'un semestre, ou des deux, pour une année.
- Rôles autorisés : directeur ; RP et adjoint de la filière.
- Règles de gestion : RG-24, RG-25.
- Corps de la requête : `{ levelId, semesterNumbers: [1] | [2] | [1, 2] }`.
- Effet : toutes les notes `entered` des modules concernés passent à `published`. On peut
  republier plus tard pour les notes saisies en retard.
- Réponse 200 : `{ publishedCount, missingGrades: [ { moduleId, moduleName, studentsWithoutGrade } ] }`.
  `missingGrades` sert seulement à informer le RP.
- Erreurs : 400, 401, 403, 404.

### POST /api/grades/delegations

- Objectif : déléguer à un RP le pouvoir de corriger les notes.
- Rôles autorisés : directeur.
- Règles de gestion : RG-22 ; user story D4.
- Corps de la requête : `{ programHeadId, type: 'temporary' | 'permanent', startsAt,
endsAt? }`. `endsAt` est obligatoire si `type` vaut `temporary`.
- Réponse 201 : `{ delegation: { id, programHeadId, grantedById, type, startsAt, endsAt } }`.
- Erreurs : 400 (`endsAt` manquant ou antérieur à `startsAt`), 401, 403, 404 (utilisateur
  qui n'est pas RP).

### GET /api/grades/delegations

- Objectif : lister les délégations.
- Rôles autorisés : directeur. Un RP voit sa propre délégation via
  `GET /api/auth/me` (`canCorrectGrades`, `delegationEndsAt`).
- Paramètres de requête : `active=true` (optionnel).
- Réponse 200 : `{ items: [delegation + programHeadName] }`.
- Erreurs : 401, 403.

### DELETE /api/grades/delegations/:delegationId

- Objectif : retirer une délégation avant son terme.
- Rôles autorisés : directeur.
- Effet : `endsAt` reçoit l'heure du serveur. La ligne est gardée pour l'historique.
- Réponse 204 : aucun contenu.
- Erreurs : 401, 403, 404.

---

## 9. Informations et canaux — `/api/channels`

Tâche A-12 (sprint 3). Règles RG-30 à RG-35. Les canaux sont créés automatiquement : le canal
général dans les données de départ, un canal par filière et un sous-canal par année (voir
section 5).

### GET /api/channels

- Objectif : canaux visibles par l'utilisateur, en indiquant ceux où il peut publier.
- Rôles autorisés : tous. Étudiant : canal général, sa filière et son année. Professeur :
  canal général et les filières et années de ses affectations. RP et adjoint : canal général,
  leur filière et ses années. Directeur : tous.
- Règles de gestion : RG-30, RG-31.
- Réponse 200 : `{ items: [ { id, scope, name, programId, levelId, canPublish } ] }`.
- Erreurs : 401.

### GET /api/channels/feed

- Objectif : dernières publications de tous les canaux visibles (section Informations,
  tableau de bord).
- Rôles autorisés : tous.
- Règles de gestion : RG-30, RG-33 ; user story E5.
- Paramètres de requête : `page`, `pageSize`.
- Réponse 200 : liste paginée de `{ id, channelId, channelName, title, content, authorName,
authorRole, createdAt, edited }`, de la plus récente à la plus ancienne. Les publications
  masquées n'y apparaissent pas.
- Erreurs : 401.

### GET /api/channels/:channelId/posts

- Objectif : publications d'un canal.
- Rôles autorisés : tout utilisateur qui voit ce canal.
- Règles de gestion : RG-33, RG-35.
- Paramètres de requête : `page`, `pageSize`.
- Réponse 200 : liste paginée de publications (même format que `feed`). Le directeur, le RP
  et l'adjoint voient aussi les publications masquées de leur périmètre, avec `hidden: true`.
- Erreurs : 401, 403, 404.

### POST /api/channels/:channelId/posts

- Objectif : publier une information, sans validation préalable.
- Rôles autorisés (RG-31) :
  - directeur : tous les canaux ;
  - RP et adjoint : canal général, canal de leur filière et sous-canaux de ses années ;
  - professeur : sous-canaux (filière + année) où il est affecté ;
  - super étudiant : canal général, canal de sa filière, sous-canal de son année ;
  - étudiant : aucun.
- Règles de gestion : RG-31, RG-32, RG-33.
- Corps de la requête : `{ title, content }`.
- Réponse 201 : `{ post: { id, channelId, title, content, authorName, createdAt,
edited: false, editableUntil } }`. `editableUntil` = `createdAt` + 5 minutes.
- Erreurs : 400, 401, 403, 404.

### PATCH /api/channels/:channelId/posts/:postId

- Objectif : modifier un message déjà envoyé.
- Rôles autorisés : **l'auteur seulement**.
- Règles de gestion : RG-34 ; décision validée n° 1.
- Corps de la requête : `{ title?, content? }`.
- Condition : moins de 5 minutes depuis `createdAt`, selon l'heure du serveur.
- Réponse 200 : `{ post }` avec `edited: true` (B affiche la mention « modifié »).
- Erreurs : 400, 401, 403 `NOT_AUTHOR`, 404, 409 `EDIT_WINDOW_EXPIRED`.

### PATCH /api/channels/:channelId/posts/:postId/visibility

- Objectif : masquer une publication, ou l'afficher à nouveau.
- Rôles autorisés : directeur ; RP et adjoint pour les canaux de leur périmètre.
- Règles de gestion : RG-35 ; décision validée n° 2.
- Corps de la requête : `{ hidden: true | false }`.
- Réponse 200 : `{ post }`.
- Erreurs : 400, 401, 403, 404.

### DELETE /api/channels/:channelId/posts/:postId

- Objectif : supprimer une publication.
- Rôles autorisés : directeur ; RP et adjoint pour les canaux de leur périmètre.
- Règles de gestion : RG-35.
- Réponse 204 : aucun contenu.
- Erreurs : 401, 403, 404.

---

## 10. Notifications — `/api/notifications`

Tâche A-13 (sprint 3). Seul le serveur crée des notifications : il n'y a pas d'endpoint
`POST` public. Elles sont générées par le déplacement ou l'annulation d'une séance (RG-14) et
par la décision de passage d'année (RG-36). B les affiche dans la section Informations.

### GET /api/notifications

- Objectif : notifications de l'utilisateur connecté.
- Rôles autorisés : tous (uniquement ses propres notifications).
- Règles de gestion : RG-14, RG-36 ; user stories E6 et E7.
- Paramètres de requête : `unreadOnly=true` (optionnel), `page`, `pageSize`.
- Réponse 200 : liste paginée de `{ id, type, content, read, createdAt, sessionId? }`, plus
  `unreadCount`.
- Erreurs : 401.

### PATCH /api/notifications/:notificationId/read

- Objectif : marquer une notification comme lue.
- Rôles autorisés : son destinataire.
- Réponse 200 : `{ id, read: true }`.
- Erreurs : 401, 404 (y compris pour la notification de quelqu'un d'autre).

### POST /api/notifications/read-all

- Objectif : tout marquer comme lu.
- Rôles autorisés : tous.
- Réponse 200 : `{ updatedCount }`.
- Erreurs : 401.

---

## 11. Vue d'ensemble — `/api/overview`

### GET /api/overview

- Objectif : chiffres clés de l'établissement pour le pilotage.
- Rôles autorisés : directeur (tout l'établissement) ; RP et adjoint (leur filière).
- Règles de gestion : user story D1.
- Réponse 200 : `{ programs: [ { id, name, levels: [ { id, number, cohort, studentCount,
teacherCount, attendanceRate, grades: { A: 12, B: 20, F: 3, missing: 5 },
publishedSemesters: [1] } ] } ] }`. Tous les chiffres sont calculés dans PostgreSQL.
- Erreurs : 401, 403.
- Tâche : A-11.

---

## 12. Points à confirmer avant le 13 novembre

| #   | Question                                                                                 | Avec qui             | Choix provisoire dans ce contrat                                                        |
| --- | ---------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------- |
| 1   | Le « numéro » d'un étudiant ou d'un professeur (RG-02, RG-03) : téléphone ou matricule ? | T                    | Téléphone (`phone`)                                                                     |
| 2   | Professeur avec comptes liés (RG-04) : avec quel e-mail se connecte-t-il ?               | T, C                 | Un seul compte, une seule adresse de connexion ; les filières ajoutent des affectations |
| 3   | Qui crée une filière ?                                                                   | T                    | Directeur seulement                                                                     |
| 4   | Le professeur peut-il annuler sa propre confirmation de cours ?                          | T                    | Non, seul le RP corrige (RG-28)                                                         |
| 5   | Confirmation d'un cours : possible dès l'heure de début ou seulement après la fin ?      | T                    | Dès l'heure de début                                                                    |
| 6   | Un adjoint peut-il recevoir une délégation de correction de notes (RG-22) ?              | T                    | Non, seulement un RP                                                                    |
| 7   | Dernière année (fin du cursus) : quelle valeur pour `nextLevelId` ?                      | T                    | Hors périmètre du prototype                                                             |
| 8   | Transport du jeton : cookie HttpOnly ou en-tête `Authorization` ?                        | C (C-2)              | Cookie HttpOnly                                                                         |
| 9   | Droits de chaque route                                                                   | C (C-1)              | Sections 3 et 4 du cahier des charges                                                   |
| 10  | Création de séances répétées (toutes les semaines) en une fois : à ajouter ?             | T (nouvelle demande) | Non incluse : une séance par requête                                                    |
