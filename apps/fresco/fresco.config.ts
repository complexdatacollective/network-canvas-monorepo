import { buildAppSuperProperties } from '@codaco/shared-consts';

import pkg from './package.json' with { type: 'json' };

export const PROTOCOL_EXTENSION = '.netcanvas';
export const APP_SUPPORTED_SCHEMA_VERSIONS = [7, 8];

// Analytics. The project key, relay host and super-property shape are shared by
// every Network Canvas product so their events land in one project under one
// schema — see `@codaco/shared-consts`.
export const POSTHOG_APP_NAME = 'Fresco';
export const POSTHOG_APP_VERSION = pkg.version;
export const POSTHOG_APP_PROPERTIES = buildAppSuperProperties({
  appKey: POSTHOG_APP_NAME,
  appName: POSTHOG_APP_NAME,
  version: POSTHOG_APP_VERSION,
});
export {
  POSTHOG_API_KEY,
  POSTHOG_HOST as POSTHOG_PROXY_HOST,
} from '@codaco/shared-consts';

// If unconfigured, the app will shut down after 2 hours (7200000 ms)
export const UNCONFIGURED_TIMEOUT = 7200000;

// Maximum size of a .netcanvas protocol file that can be imported.
// This matches the UploadThing per-file limit (256MB) and is enforced
// regardless of storage provider to keep messaging consistent.
export const MAX_PROTOCOL_UPLOAD_BYTES = 256 * 1024 * 1024;
