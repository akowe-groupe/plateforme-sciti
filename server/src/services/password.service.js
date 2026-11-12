/**
 * @file Mots de passe : hachage, vérification, mot de passe temporaire, règles de robustesse.
 * Règles de gestion : RG-06 ; règle technique n° 9 du guide.
 */
import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';

/** Coût de bcrypt : 12 = environ 250 ms par essai, assez lent contre la force brute. */
const BCRYPT_COST = 12;

/** Lettres et chiffres sans les caractères qui se confondent à l'œil (0/O, 1/l/I). */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

/**
 * Hache un mot de passe. Le mot de passe en clair n'est jamais stocké ni journalisé.
 * @param {string} plain
 * @returns {Promise<string>}
 */
export function hashPassword(plain) {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Compare un mot de passe saisi à un hachage stocké.
 * @param {string} plain
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/**
 * Hachage factice, comparé quand l'e-mail n'existe pas : la réponse prend alors autant de
 * temps qu'avec un vrai compte, et on ne peut pas deviner quels e-mails existent.
 */
export const DUMMY_HASH = bcrypt.hashSync('compte-inexistant', BCRYPT_COST);

/**
 * Génère un mot de passe temporaire aléatoire, au format « K7m-q2Rx-94b » (RG-06).
 * `randomInt` vient de crypto : un tirage imprévisible, contrairement à Math.random.
 * Il est affiché une seule fois à la personne qui crée le compte, puis seul son hachage
 * est gardé.
 * @returns {string}
 */
export function generateTemporaryPassword() {
  const pick = (n) =>
    Array.from({ length: n }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

/**
 * Vérifie la robustesse d'un nouveau mot de passe.
 * Règles affichées dans la maquette « Nouveau mot de passe » : au moins 10 caractères,
 * au moins une lettre et un chiffre.
 * @param {string} plain
 * @returns {string[]} Les règles non respectées (tableau vide = mot de passe accepté).
 */
export function passwordProblems(plain) {
  const problems = [];
  if (plain.length < 10) problems.push('Au moins 10 caractères.');
  if (!/[A-Za-z]/.test(plain) || !/\d/.test(plain))
    problems.push('Au moins une lettre et un chiffre.');
  return problems;
}
