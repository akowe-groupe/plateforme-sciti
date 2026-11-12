/**
 * @file Validation des entrées avec Zod (règle technique n° 3 du guide).
 * Aucune donnée de la requête n'est utilisée avant d'être passée par un schéma.
 */

/**
 * Valide les parties de la requête et range le résultat dans `req.valid`.
 * Les contrôleurs lisent `req.valid.params`, `req.valid.query` et `req.valid.body`,
 * jamais `req.params`, `req.query` ou `req.body` directement.
 * Une erreur Zod est transformée en réponse 400 par le gestionnaire central.
 *
 * @param {{params?: import('zod').ZodType, query?: import('zod').ZodType, body?: import('zod').ZodType}} schemas
 * @returns {import('express').RequestHandler}
 */
export function validate(schemas) {
  return (req, res, next) => {
    req.valid = {};
    for (const part of ['params', 'query', 'body']) {
      if (schemas[part]) {
        req.valid[part] = schemas[part].parse(req[part] ?? {});
      }
    }
    next();
  };
}
