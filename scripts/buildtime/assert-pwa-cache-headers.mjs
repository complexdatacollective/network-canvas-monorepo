const NO_STORE_DIRECTIVES = new Set([
  'no-store',
  'no-cache',
  'max-age=0',
  'must-revalidate',
]);
const IMMUTABLE_ASSET_DIRECTIVES = new Set([
  'public',
  'max-age=31536000',
  'immutable',
]);

const COMMON_STABLE_PWA_PATHS = [
  '/',
  '/sw.js',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/apple-touch-icon-180x180.png',
  '/pwa-64x64.png',
  '/pwa-192x192.png',
  '/pwa-512x512.png',
  '/maskable-icon-512x512.png',
];

const parseHeaderRules = (text) => {
  const rules = [];
  let currentRule;

  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    if (/^\s/.test(line)) {
      if (!currentRule) {
        throw new Error(`header without a path on line ${index + 1}`);
      }

      const separator = trimmed.indexOf(':');
      if (separator === -1) {
        throw new Error(`malformed header on line ${index + 1}`);
      }

      const name = trimmed.slice(0, separator).trim().toLowerCase();
      const value = trimmed.slice(separator + 1).trim();
      if (currentRule.headers.has(name)) {
        throw new Error(
          `duplicate ${name} header for ${currentRule.path} on line ${index + 1}`,
        );
      }
      currentRule.headers.set(name, value);
      continue;
    }

    currentRule = { path: trimmed, headers: new Map() };
    rules.push(currentRule);
  }

  return rules;
};

const parseDirectives = (value) =>
  new Set(
    value
      .split(',')
      .map((directive) => directive.trim().toLowerCase())
      .filter(Boolean),
  );

const formatDirectives = (directives) =>
  [...directives]
    .toSorted((left, right) => left.localeCompare(right))
    .join(', ');

const assertDirectiveSet = (path, actualValue, expectedDirectives) => {
  if (actualValue === undefined) {
    throw new Error(`missing Cache-Control for ${path}`);
  }

  const actualDirectives = parseDirectives(actualValue);
  if (
    actualDirectives.size !== expectedDirectives.size ||
    [...expectedDirectives].some(
      (directive) => !actualDirectives.has(directive),
    )
  ) {
    throw new Error(
      `invalid Cache-Control for ${path}: expected "${formatDirectives(expectedDirectives)}", received "${formatDirectives(actualDirectives)}"`,
    );
  }
};

const NESTED_BASE_PATTERN = /^\/(?:[a-z0-9-]+\/)+$/;

/**
 * Assert the deploy cache contract for one production PWA `_headers` file.
 * Stable entry points must never be stored; only content-hashed assets are
 * immutable. Netlify matches `_headers` against the requested URL before an
 * SPA rewrite, so `/*` must cover deep-link HTML requests. Its more-specific
 * `/assets/*` rule replaces Cache-Control for content-hashed assets.
 *
 * `nestedBases` lists sub-paths (such as `/v8/`) where the same deploy serves
 * another build of the app. Netlify reads `_headers` only at the publish root,
 * so the root file has to carry the nested app's contract as well: every
 * stable path rebased under the nested base must be no-store, and the nested
 * `assets/*` must be immutable.
 */
export const assertPwaCacheHeaders = ({
  additionalStablePaths = [],
  nestedBases = [],
  text,
}) => {
  const rules = parseHeaderRules(text);
  const rulesByPath = new Map();

  for (const rule of rules) {
    if (rulesByPath.has(rule.path)) {
      throw new Error(`duplicate header rule for ${rule.path}`);
    }
    rulesByPath.set(rule.path, rule);
  }

  assertDirectiveSet(
    '/*',
    rulesByPath.get('/*')?.headers.get('cache-control'),
    NO_STORE_DIRECTIVES,
  );

  const stablePaths = [...COMMON_STABLE_PWA_PATHS, ...additionalStablePaths];
  const immutablePaths = ['/assets/*'];
  for (const base of nestedBases) {
    if (!NESTED_BASE_PATTERN.test(base)) {
      throw new Error(
        `nested base must look like "/v8/"; received ${JSON.stringify(base)}`,
      );
    }
    const rebase = (path) => `${base}${path.slice(1)}`;
    stablePaths.push(
      ...[...COMMON_STABLE_PWA_PATHS, ...additionalStablePaths].map(rebase),
    );
    immutablePaths.push(rebase('/assets/*'));
  }

  for (const stablePath of stablePaths) {
    assertDirectiveSet(
      stablePath,
      rulesByPath.get(stablePath)?.headers.get('cache-control'),
      NO_STORE_DIRECTIVES,
    );
  }

  for (const immutablePath of immutablePaths) {
    assertDirectiveSet(
      immutablePath,
      rulesByPath.get(immutablePath)?.headers.get('cache-control'),
      IMMUTABLE_ASSET_DIRECTIVES,
    );
  }
};
