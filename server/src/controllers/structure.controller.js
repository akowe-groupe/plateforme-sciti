/**
 * @file Contrôleur de la structure académique : lit la requête validée, appelle le service,
 * renvoie la réponse. Aucune règle métier ici (voir services/structure.service.js).
 * Règles de gestion : RG-09, RG-10, RG-26, RG-29.
 */
import * as structure from '../services/structure.service.js';

/** GET /api/structure/programs */
export async function listPrograms(req, res) {
  res.json(await structure.listPrograms(req.user));
}

/** POST /api/structure/programs */
export async function createProgram(req, res) {
  res.status(201).json(await structure.createProgram(req.user, req.valid.body));
}

/** POST /api/structure/programs/:programId/levels */
export async function createLevel(req, res) {
  const { programId } = req.valid.params;
  res.status(201).json(await structure.createLevel(req.user, programId, req.valid.body));
}

/** GET /api/structure/levels/:levelId */
export async function getLevel(req, res) {
  res.json(await structure.getLevel(req.user, req.valid.params.levelId));
}

/** PATCH /api/structure/levels/:levelId/current-semester */
export async function setCurrentSemester(req, res) {
  const { levelId } = req.valid.params;
  const { semesterNumber } = req.valid.body;
  res.json(await structure.setCurrentSemester(req.user, levelId, semesterNumber));
}

/** POST /api/structure/semesters/:semesterId/modules */
export async function createModule(req, res) {
  const { semesterId } = req.valid.params;
  res.status(201).json(await structure.createModule(req.user, semesterId, req.valid.body));
}

/** PATCH /api/structure/modules/:moduleId */
export async function updateModule(req, res) {
  const { moduleId } = req.valid.params;
  res.json(await structure.updateModule(req.user, moduleId, req.valid.body));
}

/** DELETE /api/structure/modules/:moduleId */
export async function deleteModule(req, res) {
  await structure.deleteModule(req.user, req.valid.params.moduleId);
  res.status(204).end();
}

/** GET /api/structure/modules/:moduleId/students */
export async function listModuleStudents(req, res) {
  const { moduleId } = req.valid.params;
  res.json(await structure.listModuleStudents(req.user, moduleId, req.valid.query));
}
