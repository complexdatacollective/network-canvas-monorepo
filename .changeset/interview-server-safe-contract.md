---
'@codaco/interview': minor
---

Add a server-safe `@codaco/interview/contract` entry point.

Importing anything from the package root evaluates the React component graph
(`Shell` and its module-level `createContext` calls), which throws when pulled
into a server / React Server Component build. The new `@codaco/interview/contract`
subpath is bundled separately and re-exports only the React-free contract — the
`createInitialNetwork` and `isValidAssetType` utilities and the public payload /
handler types — so host servers can import them without evaluating any React
code.

`createInitialNetwork` now lives in `src/contract/` alongside `isValidAssetType`
(a single definition, still re-exported from the package root for existing
consumers). No runtime behaviour changes for existing imports.
