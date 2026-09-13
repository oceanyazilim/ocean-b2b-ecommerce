import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

import { baseConfig } from "./base.js";

// For React libraries that are not Next.js apps (e.g. @ocean/ui, theme packages).
/** @type {import("eslint").Linter.Config[]} */
export const reactConfig = [
  ...baseConfig,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: { ...reactHooks.configs.recommended.rules },
  },
];

export default reactConfig;
