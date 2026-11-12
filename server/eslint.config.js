/**
 * @file Configuration ESLint du serveur (règles recommandées, Node.js, modules ES).
 * À fusionner avec celle du client quand B aura posé la configuration commune à la racine.
 */
import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      eqeqeq: 'error',
    },
  },
];
