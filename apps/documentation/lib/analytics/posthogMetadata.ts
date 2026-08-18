import pkg from '../../package.json' with { type: 'json' };

export const POSTHOG_APP_PROPERTIES = {
  app: 'Documentation',
  $app_name: 'Documentation',
  host_version: pkg.version,
  $app_version: pkg.version,
} as const;
