/**
 * @file Zod configuré en français : tous les schémas importent `z` depuis ce fichier, pour
 * que les messages d'erreur renvoyés au client soient en français (règle n° 11 du guide).
 */
import { z } from 'zod';

z.config(z.locales.fr());

export { z };
