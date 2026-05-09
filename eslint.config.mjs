import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // The eslint-config-next bump turned react-hooks/set-state-in-effect
    // into an error, but several pre-existing components legitimately read
    // window-only state (cookies, sessionStorage, matchMedia) inside a
    // post-mount effect to avoid SSR mismatches. Demote to a warning so CI
    // doesn't fail on the existing surface — convert call sites to a lazy
    // useState initializer when touching the file.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
