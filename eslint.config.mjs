import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Zasady wynikające z lekcji starej wersji (patrz plan remasteru)
const config = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "node_modules/**", "lib/db/database.types.ts", "next-env.d.ts", "supabase/functions/*/index.ts", "public/sw.js"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name='toISOString']",
          message: "Nie licz dat przez toISOString() (UTC). Użyj funkcji z lib/domain/dates.",
        },
        {
          selector: "CallExpression[callee.name=/^(alert|confirm)$/]",
          message: "Bez alert()/confirm(): użyj toastu z Cofnij.",
        },
      ],
    },
  },
];

export default config;
