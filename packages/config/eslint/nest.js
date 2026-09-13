import { baseConfig } from "./base.js";

/** @type {import("eslint").Linter.Config[]} */
export const nestConfig = [
  ...baseConfig,
  {
    files: ["**/*.ts"],
    rules: {
      // Nest DI relies on classes as runtime values, so type-only imports break metadata.
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-extraneous-class": "off",
    },
  },
];

export default nestConfig;
