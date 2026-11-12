/**
 * @file Erreur HTTP « prévue » : un service la lance quand une règle refuse l'action.
 * Le gestionnaire central (middlewares/error-handler.js) la transforme en réponse JSON au
 * format du contrat d'API (docs/api.md, § 0.5).
 */

export class HttpError extends Error {
  /**
   * @param {number} status - Code HTTP (400, 403, 409...).
   * @param {string} code - Code stable en anglais, lu par le front (ex. ATTENDANCE_LOCKED).
   * @param {string} message - Message en français, affichable tel quel à l'utilisateur.
   * @param {Array<{field: string, message: string}>} [details=[]] - Détails de validation.
   */
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
