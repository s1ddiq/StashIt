import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends(
    "next/core-web-vitals",
    "next/typescript",
    "standard",
    "plugin:tailwindcss/recommended",
    "prettier"
  ),
  {
    rules: {
      "no-lone-blocks": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-empty": "off",
      "tailwindcss/classnames-order": "off",
      "tailwindcss/enforces-shorthand": "off",
      "tailwindcss/no-custom-classname": "off",
      "react-hooks/exhaustive-deps": "off",
    },
  },
];

export default eslintConfig;
