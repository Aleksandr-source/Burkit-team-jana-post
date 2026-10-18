import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    ...js.configs.recommended,
    files: ['server/**/*.mjs', 'scripts/**/*.mjs', 'evaluation/catalog.mjs'],
    languageOptions: { ecmaVersion: 'latest', globals: globals.node },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] },
  },
  firebaseRulesPlugin.configs['flat/recommended']
);
