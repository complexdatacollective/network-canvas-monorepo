/**
 * PostHog configuration shared by every Network Canvas product.
 *
 * Architect, Interviewer, Fresco, the documentation site, the project website
 * and the `@codaco/interview` runtime all report to one Codaco-managed PostHog
 * project, behind one proxy host, using one super-property vocabulary. That is
 * what makes a single query answer "how is this feature used across Network
 * Canvas" — and it only holds while there is one definition of the values. Five
 * hand-written copies of the same object drift the moment one product renames a
 * key, and nothing fails when they do: PostHog accepts any property name, so a
 * typo becomes a silently-missing dimension rather than an error.
 */

/**
 * The PostHog project key.
 *
 * This is public PostHog data, not a secret: it names the project an event
 * belongs to, is shipped in every product's client bundle where anyone can read
 * it, and confers no read access to captured data. Sourcing it from a build-time
 * variable therefore buys nothing, and costs the ability to notice when it is
 * missing — a build without it still succeeds and simply stops reporting.
 */
export const POSTHOG_API_KEY =
  'phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c';

/**
 * Codaco-managed Cloudflare Worker (`workers/posthog-proxy`) that forwards to
 * PostHog, so no product ever contacts a third-party domain directly.
 */
export const POSTHOG_HOST = 'https://ph-relay.networkcanvas.com';

/**
 * Super-property keys identifying the product an event came from. snake_case
 * per PostHog convention; the `$`-prefixed names are PostHog's own reserved
 * properties, which populate its built-in app/version reporting.
 *
 * `@codaco/interview` extends this set with its own interview-scoped keys —
 * see `packages/interview/src/analytics/PROPERTY_KEYS.ts`. It spreads these
 * rather than restating them, so the strings below are the only definition.
 */
export const POSTHOG_APP_PROPS = {
  APP: 'app',
  APP_NAME: '$app_name',
  APP_VERSION: '$app_version',
  HOST_VERSION: 'host_version',
  INSTALLATION_ID: 'installation_id',
} as const;

/**
 * The super properties a product registers on its PostHog client. Products
 * build this through {@link buildAppSuperProperties} rather than writing the
 * literal keys, so a mistyped key is a compile error rather than a dimension
 * that quietly stops being reported.
 */
export type AppSuperProperties = {
  [POSTHOG_APP_PROPS.APP]: string;
  [POSTHOG_APP_PROPS.APP_NAME]: string;
  [POSTHOG_APP_PROPS.APP_VERSION]: string;
  [POSTHOG_APP_PROPS.HOST_VERSION]: string;
  [POSTHOG_APP_PROPS.INSTALLATION_ID]?: string;
};

export type AppSuperPropertiesInput = {
  /**
   * Machine-readable product identifier, used for grouping and filtering.
   * Stable across renames — `ArchitectWeb`, `interviewer`, `Fresco`.
   */
  appKey: string;
  /** Human-readable product name, shown in the PostHog UI. */
  appName: string;
  /** The product's own version, normally its `package.json` version. */
  version: string;
  /**
   * Anonymous per-installation identifier. Omitted by products that have none;
   * never a user or participant identifier.
   */
  installationId?: string;
};

/**
 * Build the super-property object a product registers on its PostHog client.
 *
 * `host_version` and `$app_version` are deliberately the same value: PostHog
 * reads `$app_version` for its own version reporting, while `host_version` is
 * the name the interview runtime uses for the version of whatever is hosting it
 * — for a standalone product, that host is the product itself.
 */
export function buildAppSuperProperties({
  appKey,
  appName,
  version,
  installationId,
}: AppSuperPropertiesInput): AppSuperProperties {
  const properties: AppSuperProperties = {
    [POSTHOG_APP_PROPS.APP]: appKey,
    [POSTHOG_APP_PROPS.APP_NAME]: appName,
    [POSTHOG_APP_PROPS.APP_VERSION]: version,
    [POSTHOG_APP_PROPS.HOST_VERSION]: version,
  };

  // Absent rather than `undefined`: posthog-js sends registered properties
  // verbatim, and an explicit `installation_id: undefined` reaches the project
  // as a null-valued dimension on every event from products that have no
  // installation concept.
  if (installationId !== undefined) {
    properties[POSTHOG_APP_PROPS.INSTALLATION_ID] = installationId;
  }

  return properties;
}
