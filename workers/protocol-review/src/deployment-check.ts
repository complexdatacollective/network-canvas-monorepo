import {
  ALLOWED_ORIGINS,
  PROTOCOL_REVIEW_SERVICE_URL,
  PROVIDERS_PATH,
  ProviderStatusSchema,
  REVIEW_PATH,
  REVIEW_PROVIDERS,
} from './contract.ts';

/**
 * What is wrong with the deployed service, as seen from outside it: an empty
 * list when it answers Architect and nobody else, and can say which
 * providers are available.
 *
 * The release job runs this after `wrangler deploy` (see
 * `scripts/check-deployment.mjs`). It sends preflight requests, which reach
 * the Worker's origin check and nothing after it, and asks which providers
 * are available, which reads the limiter and calls no model. So the check
 * needs no key, counts against no limit and spends nothing, and still shows
 * that this version of the Worker and its Durable Object are the ones
 * answering.
 */

/** An origin the service must refuse: the allow-list is what answers, not a wildcard. */
const FOREIGN_ORIGIN = 'https://example.com';

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export const deploymentProblems = async (
  fetcher: Fetcher,
): Promise<string[]> => {
  const url = `${PROTOCOL_REVIEW_SERVICE_URL}${REVIEW_PATH}`;
  const preflight = (origin: string) =>
    fetcher(url, {
      method: 'OPTIONS',
      headers: { 'Origin': origin, 'Access-Control-Request-Method': 'POST' },
    });

  const problems: string[] = [];
  for (const origin of ALLOWED_ORIGINS) {
    const response = await preflight(origin);
    const allowed = response.headers.get('Access-Control-Allow-Origin');
    if (response.status !== 204) {
      problems.push(
        `A preflight from ${origin} answered ${response.status}, not 204.`,
      );
    } else if (allowed !== origin) {
      problems.push(
        `A preflight from ${origin} allowed ${allowed ?? 'no origin'}.`,
      );
    }
  }

  const foreign = await preflight(FOREIGN_ORIGIN);
  if (
    foreign.status !== 403 ||
    foreign.headers.has('Access-Control-Allow-Origin')
  ) {
    problems.push(
      `A preflight from ${FOREIGN_ORIGIN} answered ${foreign.status}, not a refusal.`,
    );
  }

  const [origin] = ALLOWED_ORIGINS;
  const status = await fetcher(
    `${PROTOCOL_REVIEW_SERVICE_URL}${PROVIDERS_PATH}`,
    { method: 'GET', headers: { Origin: origin } },
  );
  if (status.status !== 200) {
    problems.push(
      `Asking which providers are available answered ${status.status}, not 200.`,
    );
    return problems;
  }
  let listed: unknown;
  try {
    listed = await status.json();
  } catch {
    listed = null;
  }
  const parsed = ProviderStatusSchema.safeParse(listed);
  const expected = REVIEW_PROVIDERS.join(', ');
  if (
    !parsed.success ||
    parsed.data.providers.map(({ provider }) => provider).join(', ') !==
      expected
  ) {
    problems.push(`The providers listed were not ${expected}.`);
  }
  return problems;
};
