/**
 * @file Contrôleur des comptes : lit la requête validée, appelle le service, répond.
 * Règles de gestion : RG-02 à RG-06, RG-31.
 */
import * as accounts from '../services/accounts.service.js';

/** GET /api/accounts */
export async function list(req, res) {
  res.json(await accounts.listAccounts(req.user, req.valid.query));
}

/** GET /api/accounts/teachers/search */
export async function searchTeachers(req, res) {
  res.json(await accounts.searchTeachers(req.user, req.valid.query));
}

/** POST /api/accounts/students */
export async function createStudent(req, res) {
  res.status(201).json(await accounts.createStudent(req.user, req.valid.body));
}

/** POST /api/accounts/teachers */
export async function createTeacher(req, res) {
  res.status(201).json(await accounts.createTeacher(req.user, req.valid.body));
}

/** POST /api/accounts/teachers/:teacherId/assignments */
export async function addAssignment(req, res) {
  const { teacherId } = req.valid.params;
  res.status(201).json(await accounts.addAssignment(req.user, teacherId, req.valid.body.moduleId));
}

/** DELETE /api/accounts/teachers/:teacherId/assignments/:assignmentId */
export async function removeAssignment(req, res) {
  const { teacherId, assignmentId } = req.valid.params;
  await accounts.removeAssignment(req.user, teacherId, assignmentId);
  res.status(204).end();
}

/** POST /api/accounts/program-heads */
export async function createProgramHead(req, res) {
  res.status(201).json(await accounts.createManager(req.user, 'programHead', req.valid.body));
}

/** POST /api/accounts/assistants */
export async function createAssistant(req, res) {
  res.status(201).json(await accounts.createManager(req.user, 'assistant', req.valid.body));
}

/** PATCH /api/accounts/students/:studentId/super-student */
export async function setSuperStudent(req, res) {
  const { studentId } = req.valid.params;
  res.json(await accounts.setSuperStudent(req.user, studentId, req.valid.body.isSuperStudent));
}

/** POST /api/accounts/:userId/reset-password */
export async function resetPassword(req, res) {
  res.json(await accounts.resetPassword(req.user, req.valid.params.userId));
}
