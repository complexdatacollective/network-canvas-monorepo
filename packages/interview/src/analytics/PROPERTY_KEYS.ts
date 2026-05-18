// PostHog instance name. Must be unique across all posthog-js instances on a
// page so we never collide with a host's default-named instance.
export const INSTANCE_NAME = '@codaco/interview';

// Codaco-managed PostHog proxy. The project key is public PostHog data, not a
// secret — same value used by architect-web and the documentation app.
export const POSTHOG_API_KEY =
  'phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c';
export const POSTHOG_HOST = 'https://ph-relay.networkcanvas.com';

// Super-property keys (snake_case for PostHog convention).
export const SUPER_PROPS = {
  APP: 'app',
  INSTALLATION_ID: 'installation_id',
  HOST_VERSION: 'host_version',
  PACKAGE_VERSION: 'package_version',
  PROTOCOL_HASH: 'protocol_hash',
  STAGE_TYPE: 'stage_type',
  STAGE_INDEX: 'stage_index',
  PROMPT_INDEX: 'prompt_index',
} as const;

export type SuperProperties = {
  [SUPER_PROPS.APP]: string;
  [SUPER_PROPS.INSTALLATION_ID]: string;
  [SUPER_PROPS.HOST_VERSION]?: string;
  [SUPER_PROPS.PACKAGE_VERSION]: string;
  [SUPER_PROPS.PROTOCOL_HASH]: string;
  [SUPER_PROPS.STAGE_TYPE]?: string;
  [SUPER_PROPS.STAGE_INDEX]?: number;
  [SUPER_PROPS.PROMPT_INDEX]?: number;
};
