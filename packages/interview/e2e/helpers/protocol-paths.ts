import path from 'node:path';

// Single source of truth for the SILOS .netcanvas fixture used by the e2e
// suite, the dev host, and any extraction scripts. Resolved relative to this
// module so it is independent of the caller's working directory.
export const SILOS_PROTOCOL_PATH = path.resolve(
  import.meta.dirname,
  '../data/silos_chicago-2026-06-02_14-50.netcanvas',
);
