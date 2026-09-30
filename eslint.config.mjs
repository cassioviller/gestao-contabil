// ESLint flat config para o monorepo. Regras de tipo (typescript-eslint) sem
// "type-checked" para o lint ficar rápido; o `tsc` já cobre o resto.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "lib/api-client-react/src/generated/**",
      "lib/api-zod/src/generated/**",
      "lib/db/drizzle/**",
      "artifacts/gestao-contabil/test-results/**",
      "artifacts/gestao-contabil/playwright-report/**",
      "artifacts/mockup-sandbox/**",
      "dados-locais/**",
      ".migration-backup/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser, ...globals.es2022 },
    },
    rules: {
      // `_x` marca de propósito o que não se usa (destructuring para omitir campos).
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
    },
  },
  {
    // Scripts de linha de comando falam pelo console.
    files: ["lib/db/scripts/**", "scripts/**", "**/*.mjs", "**/build.mjs", "**/e2e/**"],
    rules: { "no-console": "off" },
  },
  {
    files: ["**/*.tsx", "**/hooks/**/*.ts"],
    plugins: { "react-hooks": reactHooks, "jsx-a11y": jsxA11y },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      // Rótulos visíveis ao lado do campo já são o padrão das telas; o
      // atributo aria-label cobre os inputs de célula.
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/no-autofocus": "off",
    },
  },
  {
    // Componentes copiados do shadcn/ui e seus hooks: código de terceiros,
    // atualizado de fora; não se corrige à mão.
    files: ["**/components/ui/**", "**/hooks/use-mobile.tsx", "**/hooks/use-toast.ts"],
    rules: {
      "jsx-a11y/heading-has-content": "off",
      "jsx-a11y/anchor-has-content": "off",
      "jsx-a11y/click-events-have-key-events": "off",
      "jsx-a11y/no-noninteractive-element-interactions": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);
