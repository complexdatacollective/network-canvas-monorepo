/**
 * Canonical per-interface option-key inventory for the e2e matrix.
 * Keys are free-form but stable; the coverage manifest test (a) checks every
 * key here is claimed by >=1 scenario's `covers` (or by the shared
 * cross-cutting suite via shared-claims.ts), and (b) walks each stage
 * schema's top-level and prompt-level Zod keys to catch schema options
 * missing from this inventory entirely.
 */
export const OPTION_INVENTORY: Record<string, readonly string[]> = {
  Information: [
    'title',
    'items[].type=text',
    'items[].type=asset(image)',
    'items[].type=asset(audio)',
    'items[].type=asset(video)',
    'items[].size',
    'items[].description',
    'items-ordering',
    'items=[]',
    'title-empty',
    'markdown-allowlist',
    'external-links',
    'missing-asset-fallback',
    'unsupported-asset-fallback',
    'label',
    'interviewScript',
    'skipLogic',
  ],
};
