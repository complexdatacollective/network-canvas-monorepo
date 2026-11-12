import { describe, expect, it } from 'vitest';

import { ALLOWED_ORIGINS } from '../contract.ts';
import { deploymentProblems } from '../deployment-check.ts';
import { handleRequest } from '../review.ts';
import { answerWith, createHarness, scriptedModel } from './helpers.ts';

/** The service as deployed, answered by the real request handler. */
const service = () => {
  const harness = createHarness(scriptedModel({ chunks: [answerWith([])] }));
  return (url: string, init: RequestInit) =>
    handleRequest(new Request(url, init), harness.deps);
};

describe('the deployment check', () => {
  it('finds nothing wrong with the service as it is written', async () => {
    expect(await deploymentProblems(service())).toEqual([]);
  });

  it('reports a service that answers every origin', async () => {
    const problems = await deploymentProblems(
      async (_url, init) =>
        new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin':
              new Headers(init.headers).get('Origin') ?? '',
          },
        }),
    );
    expect(problems).toEqual([
      'A preflight from https://example.com answered 204, not a refusal.',
      'Asking which providers are available answered 204, not 200.',
    ]);
  });

  it('reports a service that does not answer Architect', async () => {
    // What the custom domain serves before the Worker is attached to it.
    const problems = await deploymentProblems(
      async () => new Response(null, { status: 403 }),
    );
    expect(problems).toEqual([
      ...ALLOWED_ORIGINS.map(
        (origin) => `A preflight from ${origin} answered 403, not 204.`,
      ),
      'Asking which providers are available answered 403, not 200.',
    ]);
  });

  it('reports a deployed version that cannot say which providers are available', async () => {
    // An earlier version of the Worker: the route does not exist.
    const older = await deploymentProblems(async (url, init) =>
      init.method === 'GET'
        ? new Response(null, { status: 404 })
        : service()(url, init),
    );
    expect(older).toEqual([
      'Asking which providers are available answered 404, not 200.',
    ]);

    const partial = await deploymentProblems(async (url, init) =>
      init.method === 'GET'
        ? Response.json({
            providers: [
              {
                provider: 'anthropic',
                available: true,
                reason: null,
                retryAt: null,
              },
            ],
          })
        : service()(url, init),
    );
    expect(partial).toEqual([
      'The providers listed were not anthropic, openai.',
    ]);
  });

  it('reports a service that allows an origin other than the one asking', async () => {
    const [first] = ALLOWED_ORIGINS;
    const problems = await deploymentProblems(async (url, init) => {
      const real = await service()(url, init);
      if (real.status !== 204) return real;
      return new Response(null, {
        status: 204,
        headers: { 'Access-Control-Allow-Origin': first },
      });
    });
    expect(problems).toEqual(
      ALLOWED_ORIGINS.filter((origin) => origin !== first).map(
        (origin) => `A preflight from ${origin} allowed ${first}.`,
      ),
    );
  });
});
