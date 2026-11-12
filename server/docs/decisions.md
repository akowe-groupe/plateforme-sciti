# Journal des décisions techniques — serveur

Chaque choix technique qui n'est pas évident : la date, la décision et la raison.

---

**13 nov. 2026 — Knex retenu pour les migrations, plutôt que Prisma.**
Raison : nos règles reposent sur des contraintes CHECK, des index uniques partiels et des
types ENUM. Knex les écrit en SQL clair, relisible par T et C, alors que Prisma demande du
SQL brut à côté de son propre schéma. Knex est aussi plus léger (pas de moteur binaire à
télécharger) et construit des requêtes paramétrées.

**13 nov. 2026 — Identifiants en UUID (`gen_random_uuid()`).**
Raison : on ne peut pas deviner l'identifiant d'un autre étudiant en ajoutant 1. La fonction
est fournie par PostgreSQL 13 et plus, sans extension.

**13 nov. 2026 — Le super étudiant n'est pas un rôle : c'est un étudiant avec
`is_super_student = true`.**
Raison : le cahier des charges (section 3) le décrit comme « un étudiant avec le droit
supplémentaire de publier ». Il garde donc tous les droits et toutes les données d'un étudiant.

**13 nov. 2026 — Un professeur a un seul compte, avec plusieurs affectations (RG-04).**
Raison : décision validée n° 5. La filière et l'année d'une affectation se retrouvent par le
module (module → semestre → année → filière), sans être recopiées. Cela évite que les
données se contredisent.

**13 nov. 2026 — Un passage d'année ajoute une inscription au lieu de modifier l'ancienne.**
Raison : RG-38, l'historique des notes et des présences reste attaché à l'année suivie. Des
index partiels garantissent une seule inscription en cours par étudiant et un seul semestre
actif par année.

**13 nov. 2026 — Tests avec `node:test` et `fetch`, intégrés à Node.js, sans Jest ni
Supertest.**
Raison : règle n° 13 du guide (peu de dépendances).

**13 nov. 2026 — Variables d'environnement lues par `node --env-file`, sans le paquet dotenv.**
Raison : cette option existe dans Node.js 22. Elles sont validées au démarrage avec Zod
(`src/config/env.js`).

**13 nov. 2026 — Express 5.**
Raison : il transmet les erreurs des fonctions `async` au gestionnaire central sans
try/catch répété dans chaque route.

**13 nov. 2026 — Provisoire : bcryptjs pour hacher les mots de passe des données de
démonstration.**
Raison : il faut un hachage pour créer les comptes de démonstration avant la tâche C-4. À
remplacer par la bibliothèque choisie par C (tâche C-2) si elle est différente.

**13 nov. 2026 — Le Bachelor dure 4 ans dans les données de démonstration.**
Raison : RG-10 (« le RP du Bachelor gère les 4 années »). À confirmer avec T, car le
programme actuel court sur 3 ans (2025-2028).

**16 nov. 2026 — L'heure de validation du pointage est stockée sur la séance
(`sessions.attendance_validated_at`), pas sur chaque présence.**
Raison : RG-16 mesure les 15 minutes à partir de la validation de la feuille entière. Une
seule heure par séance évite des heures différentes d'un étudiant à l'autre.

**16 nov. 2026 — Le statut d'une séance est accompagné de ses dates (`moved_at`,
`cancelled_at`, `confirmed_at`), et des contraintes CHECK les gardent cohérents.**
Raison : quand le RP annule une confirmation (RG-28), `moved_at` permet de savoir si la séance
redevient « prévue » ou « déplacée ». La base refuse aussi une séance « confirmée » sans auteur.

**16 nov. 2026 — Le lien « professeur affecté au module » d'une séance est vérifié par le
service, pas par une clé étrangère composée.**
Raison : une clé étrangère vers `teacher_assignments` empêcherait pour toujours de retirer une
affectation dès qu'une séance passée existe. Le service vérifie l'affectation à la création et
au changement de professeur (A-7).

**16 nov. 2026 — Délégations : le retrait anticipé est noté dans `revoked_at`, sans
modifier `ends_at`.**
Raison : on garde ce qui avait été accordé au départ. Une délégation est active si
`starts_at <= maintenant`, que `ends_at` est vide ou dans le futur, et que `revoked_at` est
vide.

**16 nov. 2026 — Les canaux des filières et des années déjà présentes sont créés par la
migration A-4. Ensuite, le service de structure les crée en même temps que la filière ou
l'année (A-6).**
Raison : RG-30, chaque filière et chaque année doivent toujours avoir leur canal.

**12 nov. 2026 — Le contrôle des droits est partagé : le middleware de C vérifie le jeton et
le rôle, les services vérifient le périmètre sur la ressource.**
Raison : savoir si un module appartient à la filière d'un RP demande de lire la base. Les
fonctions de `services/access.js` (`managesProgram`, `assertManagesProgram`) le font une fois
pour tous les services. Le middleware de C remplit `req.user = { id, role, programId,
isSuperStudent }` ; `requireUser` refuse toute route métier si `req.user` est absent.

**12 nov. 2026 — Les services reçoivent la connexion à la base en dernier paramètre
(`conn = db`).**
Raison : les tests passent une transaction et l'annulent à la fin, sans toucher aux données
de démonstration. En production, le paramètre est omis.

**12 nov. 2026 — Messages de validation Zod en français (`z.config(z.locales.fr())`).**
Raison : règle n° 11 du guide. Tous les schémas importent `z` depuis `src/schemas/zod.js`.

**12 nov. 2026 — Les étudiants d'un module = toutes les inscriptions de l'année du module,
quel que soit leur statut.**
Raison : une année est propre à une cohorte (RG-09). Un étudiant passé en année supérieure
reste visible sur les modules qu'il a suivis (historique, RG-38).

**12 nov. 2026 — Authentification (C-2 et C-4, faites par A pendant l'absence de C, à relire
par C) : bcrypt via le paquet `bcryptjs`, coût 12.**
Raison : bcrypt est cité par le cahier des charges. `bcryptjs` est écrit en JavaScript pur :
pas de compilation native, donc il s'installe pareil sur les PC Windows de l'équipe et chez
l'hébergeur. Le hachage produit est un bcrypt standard.

**12 nov. 2026 — Session = jeton JWT (HS256) dans un cookie `HttpOnly`, `SameSite=Strict`,
`Secure` en production, limité à `/api`.**
Raison : le JavaScript de la page ne peut pas lire le jeton (protection XSS) et un autre site
ne peut pas l'envoyer (protection CSRF). Le jeton ne contient que l'identifiant : rôle et
filière sont relus en base à chaque requête, donc un compte désactivé est coupé tout de suite.

**12 nov. 2026 — Session glissante de 30 minutes.**
Raison : « jeton à durée de vie courte » (guide, règle 10) sans déconnecter un étudiant qui
utilise l'application : le jeton est renouvelé dès qu'il a dépassé la moitié de sa durée.

**12 nov. 2026 — Connexion : même message et même durée de réponse si l'e-mail n'existe pas.**
Raison : on ne doit pas pouvoir deviner quels e-mails ont un compte. 10 échecs par IP et par
quart d'heure au maximum (`express-rate-limit`).

**12 nov. 2026 — Provisoire : la double vérification des directeurs, RP et adjoints (RG-07,
tâche C-6) n'est pas encore faite.**
Raison : C-6 est prévue pour le 19 novembre. En attendant, ces comptes se connectent avec
l'e-mail et le mot de passe seulement. Le champ `adminCode` est déjà accepté par la route.

**12 nov. 2026 — Les adresses e-mail sont enregistrées en minuscules.**
Raison : « Kevin@… » et « kevin@… » sont la même personne. La validation Zod convertit
l'adresse avant tout enregistrement, et l'index unique de la base ignore déjà la casse.

**12 nov. 2026 — Professeur dans plusieurs filières (RG-04) : le RP cherche d'abord la
personne (`GET /accounts/teachers/search`), puis la lie avec `existingTeacherId`.**
Raison : un seul compte et un seul mot de passe par personne. La recherche ne renvoie que
le nom, les prénoms et les filières, jamais l'e-mail ni le téléphone.

**12 nov. 2026 — Le code administrateur (RG-07) est généré à la création d'un RP ou d'un
adjoint, affiché une seule fois, et seul son hachage est gardé.**
Raison : C-6 n'aura plus qu'à le vérifier à la connexion. Format `RP-XXXX-XX` ou `AD-XXXX-XX`,
sans caractères ambigus.

**12 nov. 2026 — Réinitialiser un mot de passe : le directeur pour tout compte ; le RP et
l'adjoint pour les étudiants, professeurs et adjoints de leur filière.**
Raison : un RP ne doit pas pouvoir prendre la main sur le compte d'un directeur ou d'un
autre RP. La personne devra changer le nouveau mot de passe temporaire.

**12 nov. 2026 — `JWT_SECRET` : la valeur d'exemple de `.env.example` est refusée au
démarrage.**
Raison : copiée telle quelle, elle serait connue de toute personne ayant lu le dépôt.
