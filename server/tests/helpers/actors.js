/**
 * Utilisateurs connectés construits à partir des comptes de démonstration (npm run seed),
 * sous la forme que le middleware de C mettra dans req.user.
 */
import { db } from '../../src/db/knex.js';

const EMAILS = {
  director: 'marc.adjovi@demo.sciti.test',
  rpBachelor: 'sylvie.hounkpatin@demo.sciti.test',
  rpMaster: 'rodrigue.agbo@demo.sciti.test',
  assistantBachelor: 'fabrice.degbo@demo.sciti.test',
  teacherDossou: 'paul.dossou@demo.sciti.test', // Bases de données (B2) + Cycle de vie (M1)
  teacherKpadonou: 'aline.kpadonou@demo.sciti.test', // Java (B2) + Algorithmique (B1)
  studentB2: 'kevin.ahouansou@demo.sciti.test',
  studentM1: 'ruth.akplogan@demo.sciti.test',
};

/** @returns {Promise<Record<keyof EMAILS, {id: string, role: string, programId: string|null, isSuperStudent: boolean}>>} */
export async function loadActors() {
  const rows = await db('users').whereIn('email', Object.values(EMAILS));
  const byEmail = Object.fromEntries(rows.map((r) => [r.email, r]));
  const actors = {};
  for (const [key, email] of Object.entries(EMAILS)) {
    const u = byEmail[email];
    if (!u) throw new Error(`Compte de démo manquant (${email}) : lance « npm run seed ».`);
    actors[key] = {
      id: u.id,
      role: u.role,
      programId: u.program_id,
      isSuperStudent: u.is_super_student,
    };
  }
  return actors;
}

/** Repères de la structure de démonstration : filières, années et modules par nom. */
export async function loadStructure() {
  const programs = await db('programs');
  const levels = await db('levels');
  const modules = await db('modules as m')
    .join('semesters as s', 's.id', 'm.semester_id')
    .select('m.*', 's.level_id', 's.number as semester_number');
  const bachelor = programs.find((p) => p.name.startsWith('Bachelor'));
  const master = programs.find((p) => p.name.startsWith('Master'));
  const level = (program, number) =>
    levels.find((l) => l.program_id === program.id && l.number === number);
  const module = (name) => modules.find((m) => m.name === name);
  return { bachelor, master, level, module };
}
