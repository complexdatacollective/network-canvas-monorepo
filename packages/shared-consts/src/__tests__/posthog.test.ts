import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildAppSuperProperties,
  POSTHOG_API_KEY,
  POSTHOG_APP_PROPS,
  POSTHOG_HOST,
  sendAnonymousPostHogEvent,
} from '../posthog.ts';

describe('PostHog project configuration', () => {
  it('points every product at the Codaco project through the relay', () => {
    expect(POSTHOG_API_KEY).toBe(
      'phc_OThPUolJumHmf142W78TKWtjoYYAxGlF0ZZmhcV7J3c',
    );
    expect(POSTHOG_HOST).toBe('https://ph-relay.networkcanvas.com');
  });

  it('names the super properties PostHog expects', () => {
    expect(POSTHOG_APP_PROPS).toEqual({
      APP: 'app',
      APP_NAME: '$app_name',
      APP_VERSION: '$app_version',
      HOST_VERSION: 'host_version',
      INSTALLATION_ID: 'installation_id',
    });
  });
});

describe('buildAppSuperProperties', () => {
  it('builds the shape every product registers', () => {
    expect(
      buildAppSuperProperties({
        appKey: 'ArchitectWeb',
        appName: 'Architect',
        version: '8.1.0',
        installationId: 'abc-123',
      }),
    ).toEqual({
      app: 'ArchitectWeb',
      $app_name: 'Architect',
      $app_version: '8.1.0',
      host_version: '8.1.0',
      installation_id: 'abc-123',
    });
  });

  // posthog-js sends registered properties verbatim, so an explicit
  // `installation_id: undefined` would reach the project as a null-valued
  // dimension on every event from a product that has no installation concept.
  it('omits installation_id entirely when the product has none', () => {
    const properties = buildAppSuperProperties({
      appKey: 'Fresco',
      appName: 'Fresco',
      version: '4.1.1',
    });

    expect(properties).toEqual({
      app: 'Fresco',
      $app_name: 'Fresco',
      $app_version: '4.1.1',
      host_version: '4.1.1',
    });
    expect('installation_id' in properties).toBe(false);
  });

  // PostHog reads `$app_version` for its own version reporting; the interview
  // runtime reads `host_version` for the version of whatever is hosting it. For
  // a standalone product both are the product's own version, and a query that
  // groups on either must see the same answer.
  it('reports one version under both version keys', () => {
    const properties = buildAppSuperProperties({
      appKey: 'Website',
      appName: 'Website',
      version: '0.4.1',
    });

    expect(properties.$app_version).toBe(properties.host_version);
  });
});

describe('sendAnonymousPostHogEvent', () => {
  const app = buildAppSuperProperties({
    appKey: 'interviewer',
    appName: 'Interviewer',
    version: '8.0.0',
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts an event that names no installation, person or place', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(null, { status: 200 })),
    );
    vi.stubGlobal('fetch', fetchMock);

    await sendAnonymousPostHogEvent(app)('survey sent', { answer: 'Hello' });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://ph-relay.networkcanvas.com/i/v0/e/');
    if (typeof init?.body !== 'string') throw new Error('Expected a JSON body');
    const body: unknown = JSON.parse(init.body);
    expect(body).toEqual({
      api_key: POSTHOG_API_KEY,
      event: 'survey sent',
      distinct_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      properties: {
        ...app,
        $process_person_profile: false,
        $geoip_disable: true,
        $ip: '0.0.0.0',
        answer: 'Hello',
      },
    });
    expect(app).not.toHaveProperty('installation_id');
  });

  it('rejects when the relay cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() => Promise.reject(new TypeError('offline'))),
    );

    await expect(
      sendAnonymousPostHogEvent(app)('survey sent', {}),
    ).rejects.toThrow('offline');
  });

  it('rejects when the relay refuses the event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: 503 })),
      ),
    );

    await expect(
      sendAnonymousPostHogEvent(app)('survey sent', {}),
    ).rejects.toThrow('503');
  });
});
