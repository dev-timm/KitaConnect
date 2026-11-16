// Shared ESLint settings for all KitaConnect packages.
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    // ESLint does not read .gitignore, so build output is listed here.
    ignores: [
      "**/dist/",
      "**/build/",
      "**/.next/",
      "**/out/",
      "**/storybook-static/",
      "**/coverage/",
    ],
  },

  // ESLint's recommended rules for all JavaScript and TypeScript.
  js.configs.recommended,

  // typescript-eslint's recommended rules, including the ones that use type information.
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Each file is checked with the tsconfig.json of its own package.
        projectService: true,
      },
    },
  },

  // Plain JavaScript files (like these config files) belong to no tsconfig,
  // so type-aware rules are switched off for them.
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
