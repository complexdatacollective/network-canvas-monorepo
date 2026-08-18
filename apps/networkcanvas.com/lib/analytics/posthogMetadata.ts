import pkg from '../../package.json' with { type: 'json' };

export const POSTHOG_APP_PROPERTIES = {
  app: 'Website',
  $app_name: 'Website',
  host_version: pkg.version,
  $app_version: pkg.version,
} as const;
