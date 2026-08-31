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

/**
 * Assert the deploy cache contract for one production PWA `_headers` file.
 * Stable entry points must never be stored; only content-hashed assets are
 * immutable. `/*` is deliberately forbidden from setting Cache-Control so a
 * wildcard rule cannot conflict with the immutable assets rule.
 */
export const assertPwaCacheHeaders = ({ additionalStablePaths = [], text }) => {
  const rules = parseHeaderRules(text);
  const rulesByPath = new Map();

  for (const rule of rules) {
    if (rulesByPath.has(rule.path)) {
      throw new Error(`duplicate header rule for ${rule.path}`);
    }
    rulesByPath.set(rule.path, rule);
  }

  const wildcardCacheControl = rulesByPath
    .get('/*')
    ?.headers.get('cache-control');
  if (wildcardCacheControl !== undefined) {
    throw new Error(
      'Cache-Control must not be set on /* because it can conflict with /assets/*',
    );
  }

  for (const stablePath of [
    ...COMMON_STABLE_PWA_PATHS,
    ...additionalStablePaths,
  ]) {
    assertDirectiveSet(
      stablePath,
      rulesByPath.get(stablePath)?.headers.get('cache-control'),
      NO_STORE_DIRECTIVES,
    );
  }

  assertDirectiveSet(
    '/assets/*',
    rulesByPath.get('/assets/*')?.headers.get('cache-control'),
    IMMUTABLE_ASSET_DIRECTIVES,
  );
};
