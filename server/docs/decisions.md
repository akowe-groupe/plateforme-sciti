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
