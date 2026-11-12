/**
 * @file Routes /api/accounts (docs/api.md, § 4). Session et mot de passe changé sont
 * vérifiés dans app.js ; le rôle et le périmètre sont vérifiés par le service.
 * La route « year-decision » arrive avec A-13 (passage d'année).
 */
import { Router } from 'express';
import { requireUser } from '../middlewares/require-user.js';
import { validate } from '../middlewares/validate.js';
import { uuidParams } from '../schemas/common.schemas.js';
import {
  assignmentBody,
  createManagerBody,
  createStudentBody,
  createTeacherBody,
  listAccountsQuery,
  searchTeachersQuery,
  superStudentBody,
} from '../schemas/accounts.schemas.js';
import * as controller from '../controllers/accounts.controller.js';

export const accountsRouter = Router();

accountsRouter.use(requireUser);

accountsRouter.get('/', validate({ query: listAccountsQuery }), controller.list);

// Déclarée avant les routes avec :userId pour que « teachers » ne soit pas lu comme un id.
accountsRouter.get(
  '/teachers/search',
  validate({ query: searchTeachersQuery }),
  controller.searchTeachers,
);

accountsRouter.post('/students', validate({ body: createStudentBody }), controller.createStudent);

accountsRouter.post('/teachers', validate({ body: createTeacherBody }), controller.createTeacher);

accountsRouter.post(
  '/teachers/:teacherId/assignments',
  validate({ params: uuidParams('teacherId'), body: assignmentBody }),
  controller.addAssignment,
);

accountsRouter.delete(
  '/teachers/:teacherId/assignments/:assignmentId',
  validate({ params: uuidParams('teacherId', 'assignmentId') }),
  controller.removeAssignment,
);

accountsRouter.post(
  '/program-heads',
  validate({ body: createManagerBody }),
  controller.createProgramHead,
);

accountsRouter.post(
  '/assistants',
  validate({ body: createManagerBody }),
  controller.createAssistant,
);

accountsRouter.patch(
  '/students/:studentId/super-student',
  validate({ params: uuidParams('studentId'), body: superStudentBody }),
  controller.setSuperStudent,
);

accountsRouter.post(
  '/:userId/reset-password',
  validate({ params: uuidParams('userId') }),
  controller.resetPassword,
);
