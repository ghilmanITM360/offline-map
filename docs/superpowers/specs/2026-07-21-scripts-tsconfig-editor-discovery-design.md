# Scripts tsconfig Editor Discovery — Design

**Goal:** Fix VS Code reporting false `Cannot find name 'node:assert'` / `'node:fs'` / `'require'` errors when editing files under `scripts/`, without changing any actual build/lint/test behavior (which is already passing cleanly).

## Background

`npm run typecheck` (`tsc --noEmit` for `src/`, plus `tsc -p tsconfig.scripts.json --noEmit` for `scripts/`), `npm run lint`, and `npm run build` all currently pass with zero errors on `main` at commit `fa5a60f`. `@types/node` is installed and `tsconfig.scripts.json` already declares `"types": ["node"]`.

The false errors are editor-only: root `tsconfig.json` explicitly excludes `scripts/` (`"exclude": ["scripts", "src/__tests__"]`), and the Node-aware config lives in a sibling file, `tsconfig.scripts.json`, that VS Code's TypeScript server does not auto-discover. When a file under `scripts/` is opened, VS Code falls back to an implicit out-of-project config with no Node types, producing the reported errors. `npm run typecheck` is unaffected because it invokes `tsc -p tsconfig.scripts.json` explicitly.

## Change

Move the Node-scripts config to live inside `scripts/`, where VS Code's nearest-`tsconfig.json` discovery will find it automatically for any file opened under that directory:

1. `git mv tsconfig.scripts.json scripts/tsconfig.json`
2. Update its contents so `extends` and `include` are correct relative to the new location:
   - `"extends": "../tsconfig.json"` (was `"./tsconfig.json"`)
   - `"include": ["**/*.ts"]` (was `["scripts/**/*.ts"]`)
   - `compilerOptions` (`module`/`moduleResolution`: `NodeNext`, `types: ["node"]`) and `exclude: []` unchanged
3. Update `package.json:17` — `typecheck:scripts` — from `tsc -p tsconfig.scripts.json --noEmit` to `tsc -p scripts/tsconfig.json --noEmit`
4. Verify: `npm run typecheck:scripts` (and the full `npm run typecheck`) still pass with zero errors, output unchanged from before the move

No other files change. `src/` keeps using root `tsconfig.json` as-is (`"types": ["react", "react-native"]`) — Node globals are not added to the React Native app project, per the constraint that the two environments stay separated.

## Why this over keeping both files

The alternative (add a new `scripts/tsconfig.json` that just `extends` the existing root `tsconfig.scripts.json`, leaving the root file in place) also fixes editor discovery, but leaves two config files describing the same project — one canonical, one a re-export that exists only so the editor can find it. Moving the file keeps a single source of truth and matches the convention of a sub-project's tsconfig living inside its own directory. User confirmed this is the preferred option.

## Out of scope

No functional code changes. No dependency changes. No changes to `src/`, tests, lint rules, or the Android build. This does not touch the in-progress fresh-APK-build work (separate plan/session) or any of its outputs.

## Testing

- `npm run typecheck:scripts` — must pass with identical (zero-error) output
- `npm run typecheck` (full) — must pass
- `npm run lint` — unaffected, but re-run to confirm no regression
- `git status` — only `tsconfig.scripts.json` deletion, `scripts/tsconfig.json` addition, and the one-line `package.json` diff should appear
