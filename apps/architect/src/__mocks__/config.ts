/* eslint-env jest */
/* eslint-disable import/prefer-default-export */

import { CURRENT_SCHEMA_VERSION } from '@codaco/protocol-validation';

// Derived, exactly as `~/config` derives it: a mock that pinned a literal would
// keep reporting the old version after a schema bump and hide the very
// compatibility bug it was standing in for.
export const APP_SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
