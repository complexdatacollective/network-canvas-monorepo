/** @type {import("eslint").Linter.Config} */
const config = {
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/stylistic",
    "plugin:@typescript-eslint/recommended",
    "next/core-web-vitals",
    "prettier",
  ],
  ignorePatterns: ["node_modules", "*.stories.*", "*.test.*"],
  rules: {
    "@next/next/no-img-element": "off",
    "import/no-anonymous-default-export": "off",
    "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    "no-process-env": "error",
    "no-console": "error",
    "@typescript-eslint/consistent-type-imports": [
      "warn",
      {
        prefer: "type-imports",
        fixStyle: "inline-type-imports",
      },
    ],
    "@typescript-eslint/no-unused-vars": [
      "warn",
      {
        argsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/no-misused-promises": [
      "error",
      {
        checksVoidReturn: false,
      },
    ],
    "no-unreachable": "error",
  },
};

module.exports = config;
