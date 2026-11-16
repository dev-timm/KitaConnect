// ESLint entry point for the whole repo. The shared rules live in @kitaconnect/config.
import shared from "@kitaconnect/config/eslint.config.mjs";
import { defineConfig } from "eslint/config";

export default defineConfig(shared, {
  languageOptions: {
    parserOptions: {
      // The repo root is the starting point for finding each package's tsconfig.json.
      tsconfigRootDir: import.meta.dirname,
    },
  },
});
