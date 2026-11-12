/**
 * @file Contrôleur d'authentification : pose ou efface le cookie de session et renvoie le
 * profil. Règles de gestion : RG-06, RG-08.
 */
import * as auth from '../services/auth.service.js';
import { clearSessionCookie, setSessionCookie } from '../services/token.service.js';

/** POST /api/auth/login */
export async function login(req, res) {
  const user = await auth.login(req.valid.body);
  setSessionCookie(res, user.id);
  const publicUser = auth.toUser(user);
  res.json({ user: publicUser, mustChangePassword: publicUser.mustChangePassword });
}

/** POST /api/auth/change-password */
export async function changePassword(req, res) {
  const user = await auth.changePassword(req.user, req.valid.body);
  setSessionCookie(res, user.id); // nouveau jeton après le changement
  res.json({ user });
}

/** POST /api/auth/logout */
export function logout(req, res) {
  clearSessionCookie(res);
  res.status(204).end();
}

/** GET /api/auth/me */
export async function me(req, res) {
  res.json(await auth.getMe(req.user));
}
