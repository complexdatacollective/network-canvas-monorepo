import { POSTHOG_APP_PROPS } from '@codaco/shared-consts';

// PostHog instance name. Must be unique across all posthog-js instances on a
// page so we never collide with a host's default-named instance.
export const INSTANCE_NAME = '@codaco/interview';

// The project key and relay host are shared by every Network Canvas product;
// re-exported here so this package's analytics code has one import for all of
// its PostHog constants.
export { POSTHOG_API_KEY, POSTHOG_HOST } from '@codaco/shared-consts';

// Super-property keys (snake_case for PostHog convention).
//
// The app-identifying keys come from `@codaco/shared-consts`, where every
// product's metadata is built from the same definition — spread rather than
// restated so this package cannot drift from its hosts. The rest are the
// interview-scoped keys only this runtime reports.
export const SUPER_PROPS = {
  ...POSTHOG_APP_PROPS,
  PACKAGE_VERSION: 'package_version',
  PROTOCOL_HASH: 'protocol_hash',
  STAGE_TYPE: 'stage_type',
  STAGE_INDEX: 'stage_index',
  PROMPT_INDEX: 'prompt_index',
} as const;

export type SuperProperties = {
  [SUPER_PROPS.APP]: string;
  [SUPER_PROPS.APP_NAME]: string;
  [SUPER_PROPS.APP_VERSION]?: string;
  [SUPER_PROPS.INSTALLATION_ID]: string;
  [SUPER_PROPS.HOST_VERSION]?: string;
  [SUPER_PROPS.PACKAGE_VERSION]: string;
  [SUPER_PROPS.PROTOCOL_HASH]: string;
  [SUPER_PROPS.STAGE_TYPE]?: string;
  [SUPER_PROPS.STAGE_INDEX]?: number;
  [SUPER_PROPS.PROMPT_INDEX]?: number;
};
