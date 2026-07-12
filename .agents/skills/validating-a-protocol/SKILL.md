---
name: validating-a-protocol
description: Use when a protocol.json or .netcanvas file needs to be checked for validity against the Network Canvas protocol schema, when interpreting protocol validation errors, or when the validation CLI exits 1 with no output.
---

# Validating a Protocol

## Overview

`@codaco/protocol-validation` ships a CLI at `packages/protocol-validation/scripts/cli.js` that validates a `protocol.json` or `.netcanvas` file against the versioned Zod schema, including cross-reference (codebook) validation. Use it — do not write ad-hoc runner scripts against `src/`.

## Recipe (from the repo root)

```bash
# 1. Build the package once per checkout — the CLI imports from dist/
pnpm --filter @codaco/protocol-validation build

# 2. Validate (accepts .json or .netcanvas)
node packages/protocol-validation/scripts/cli.js path/to/protocol.json; echo "exit: $?"
```

## Interpreting the result

Always capture the exit code — a valid protocol prints **nothing**.

| Exit | Output                        | Meaning                                                                                                                                                           |
| ---- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | none                          | Valid. Silence is success (the CLI's success message is stubbed out).                                                                                             |
| 1    | ZodError issue list on stderr | Validation failed. Each issue has a `path` (JSON path into the protocol) and `message`. A stack trace follows the issue list — that's normal output, not a crash. |
| 1    | none                          | Infrastructure error, silently swallowed by the CLI — see below.                                                                                                  |

### Silent exit 1 — diagnosis checklist

The CLI's catch block discards errors, so these all exit 1 with no output:

1. No argument, or the file doesn't exist.
2. Extension is not `.json` or `.netcanvas`.
3. Malformed JSON — check with `jq empty <file>`.
4. `dist/` missing or stale — rebuild (step 1 above).
5. `.netcanvas` extraction failed: the zip must contain `protocol.json` at its root, and every file referenced by the `assetManifest` must exist under `assets/`.

To surface the real extraction error, call the library directly (the path arrives as `process.argv[1]` after `--`):

```bash
node -e "import('./packages/protocol-validation/dist/index.js').then(async (m) => {
  const fs = await import('node:fs');
  await m.extractProtocol(fs.readFileSync(process.argv[1]));
}).catch((e) => { console.error(e.message); process.exit(1); })" -- path/to/file.netcanvas
```

Extraction **fails fast** — it reports only the first missing asset. To enumerate everything wrong with a broken `.netcanvas`:

```bash
# All filenames the manifest expects (stored in the zip under assets/) vs. what's actually there
unzip -p file.netcanvas protocol.json | jq -r '.assetManifest[].source'
zipinfo -1 file.netcanvas

# Validate the embedded protocol independently — tells you whether re-zipping alone will fix it
unzip -p file.netcanvas protocol.json > /tmp/embedded.json
node packages/protocol-validation/scripts/cli.js /tmp/embedded.json; echo "exit: $?"
```

## Gotchas

- Only `schemaVersion` 7 and 8 are validatable (`VersionedProtocolSchema`). Older protocols fail the `schemaVersion` discriminator and must be migrated first (migration lives in the same package).
- An invalid stage `type` is a discriminated-union failure, so that stage's _contents_ were never checked — fix the `type` and re-run; more errors may surface inside the stage.
- Protocol files are often minified to one line. Locate errors with the issue's `path` array and `jq`, not line numbers.
- A `.netcanvas` is a zip with `protocol.json` and `assets/` at the root. To build one for testing: `cd <dir> && zip -r out.netcanvas protocol.json assets`.
- Programmatic use: import `validateProtocol` from `packages/protocol-validation/dist/index.js`; it returns a Zod `safeParseAsync` result (`{ success, error }`).
