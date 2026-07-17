import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Single source of truth for the SILOS .netcanvas fixture used by the dev host
// and any extraction scripts. Resolved by package name via
// createRequire(...).resolve rather than a relative path so knip's
// dependency-usage analysis credits packages/interview's devDependency on
// @codaco/protocols — and, load-bearing, so packages/protocols sits inside
// @codaco/interview's declared dependency closure, keeping fixture changes
// visible to the release E2E equivalence-reuse classifier.
export const SILOS_PROTOCOL_PATH =
  require.resolve('@codaco/protocols/e2e/silos/silos_chicago-2026-06-02_17-31.netcanvas');

export const TARGETED_SKIP_CONSENT_PROTOCOL_PATH = path.resolve(
  import.meta.dirname,
  '../protocols/targeted-skip-consent.json',
);

// Single source of truth for the development protocol's assets directory,
// used by matrix scenarios that need a real image/audio/video/CSV/JSON asset
// to attach. Resolved by package name via createRequire(...).resolve rather
// than a relative path so knip's dependency-usage analysis credits
// packages/interview's devDependency on @codaco/development-protocol —
// scenarios only ever read files under its assets/ directory, never import
// from the package itself, so a plain relative path would leave the
// dependency looking unused.
export const DEV_PROTOCOL_ASSETS_DIR = path.join(
  path.dirname(require.resolve('@codaco/development-protocol')),
  'assets',
);
