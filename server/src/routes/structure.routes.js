/**
 * @file Routes /api/structure (docs/api.md, § 5). Une route ne contient aucune logique :
 * utilisateur connecté, validation des entrées, puis contrôleur. Le périmètre (filière,
 * année, module) est vérifié par le service.
 */
import { Router } from 'express';
import { requireUser } from '../middlewares/require-user.js';
import { validate } from '../middlewares/validate.js';
import { pagination, uuidParams } from '../schemas/common.schemas.js';
import {
  createLevelBody,
  createModuleBody,
  createProgramBody,
  currentSemesterBody,
  updateModuleBody,
} from '../schemas/structure.schemas.js';
import * as controller from '../controllers/structure.controller.js';

export const structureRouter = Router();

structureRouter.use(requireUser);

structureRouter.get('/programs', controller.listPrograms);

structureRouter.post('/programs', validate({ body: createProgramBody }), controller.createProgram);

structureRouter.post(
  '/programs/:programId/levels',
  validate({ params: uuidParams('programId'), body: createLevelBody }),
  controller.createLevel,
);

structureRouter.get(
  '/levels/:levelId',
  validate({ params: uuidParams('levelId') }),
  controller.getLevel,
);

structureRouter.patch(
  '/levels/:levelId/current-semester',
  validate({ params: uuidParams('levelId'), body: currentSemesterBody }),
  controller.setCurrentSemester,
);

structureRouter.post(
  '/semesters/:semesterId/modules',
  validate({ params: uuidParams('semesterId'), body: createModuleBody }),
  controller.createModule,
);

structureRouter.patch(
  '/modules/:moduleId',
  validate({ params: uuidParams('moduleId'), body: updateModuleBody }),
  controller.updateModule,
);

structureRouter.delete(
  '/modules/:moduleId',
  validate({ params: uuidParams('moduleId') }),
  controller.deleteModule,
);

structureRouter.get(
  '/modules/:moduleId/students',
  validate({ params: uuidParams('moduleId'), query: pagination }),
  controller.listModuleStudents,
);
