import {
  ALLOWED_ORIGINS,
  PROTOCOL_REVIEW_SERVICE_URL,
  REVIEW_PATH,
} from './contract.ts';

/**
 * What is wrong with the deployed service, as seen from outside it: an empty
 * list when it answers Architect and nobody else.
 *
 * The release job runs this after `wrangler deploy` (see
 * `scripts/check-deployment.mjs`). It sends only preflight requests, which
 * reach the Worker's origin check and nothing after it, so the check needs no
 * key, counts against no limit and spends nothing.
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
  return problems;
};
