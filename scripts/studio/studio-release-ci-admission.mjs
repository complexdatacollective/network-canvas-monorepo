import { createGhRequest } from './studio-github-distribution-store.mjs';

const REPOSITORY = 'complexdatacollective/network-canvas-monorepo';
const WORKFLOW = '.github/workflows/ci-and-release.yml';
const API = `repos/${REPOSITORY}/actions`;

function json(response) {
  if (!Buffer.isBuffer(response?.bytes))
    throw new Error('Invalid release CI evidence.');
  try {
    return JSON.parse(response.bytes.toString('utf8'));
  } catch {
    throw new Error('Invalid release CI evidence.');
  }
}

function validateRun(run, source) {
  if (
    !run ||
    run.head_sha !== source ||
    run.head_branch !== 'main' ||
    run.event !== 'push' ||
    run.path !== WORKFLOW ||
    run.repository?.full_name !== REPOSITORY ||
    run.head_repository?.full_name !== REPOSITORY ||
    ![run.id, run.run_number, run.run_attempt].every(
      (value) => Number.isSafeInteger(value) && value > 0,
    )
  )
    throw new Error('CI evidence does not belong to the reviewed main source.');
}

/** Query fresh evidence on every publication admission, including retries.
 * An old successful attempt cannot authorize a newer pending/failed attempt.
 * The concrete GitHub transport bounds time, response size and API failures. */
export async function assertSuccessfulStudioSourceCI(
  source,
  { request = createGhRequest() } = {},
) {
  if (typeof source !== 'string' || !/^[a-f0-9]{40}$/.test(source))
    throw new Error('A full reviewed CI source is required.');
  async function latestRun() {
    const listed = json(
      await request({
        path: `${API}/workflows/ci-and-release.yml/runs`,
        query: {
          head_sha: source,
          event: 'push',
          branch: 'main',
          per_page: 100,
          page: 1,
        },
      }),
    );
    if (
      !Number.isSafeInteger(listed?.total_count) ||
      listed.total_count < 1 ||
      listed.total_count > 100 ||
      !Array.isArray(listed.workflow_runs) ||
      listed.workflow_runs.length !== listed.total_count
    )
      throw new Error('Complete main-source CI history is unavailable.');
    for (const run of listed.workflow_runs) validateRun(run, source);
    if (
      new Set(listed.workflow_runs.map(({ id }) => id)).size !==
      listed.workflow_runs.length
    )
      throw new Error('Main-source CI history contains duplicate runs.');
    return listed.workflow_runs.toSorted(
      (a, b) => b.run_number - a.run_number || b.id - a.id,
    )[0];
  }
  const latest = await latestRun();
  const current = json(await request({ path: `${API}/runs/${latest.id}` }));
  validateRun(current, source);
  if (
    current.id !== latest.id ||
    current.run_number !== latest.run_number ||
    current.run_attempt !== latest.run_attempt ||
    current.status !== 'completed' ||
    current.conclusion !== 'success'
  )
    throw new Error('The latest main-source CI attempt has not succeeded.');
  const confirmed = await latestRun();
  if (
    confirmed.id !== current.id ||
    confirmed.run_number !== current.run_number ||
    confirmed.run_attempt !== current.run_attempt ||
    confirmed.status !== 'completed' ||
    confirmed.conclusion !== 'success'
  )
    throw new Error('Main-source CI changed during release admission.');
  // The list endpoint can lag a rerun. Finish with the observed run's current
  // detail; later publication gates repeat this bounded freshness check.
  const final = json(await request({ path: `${API}/runs/${confirmed.id}` }));
  validateRun(final, source);
  if (
    final.id !== confirmed.id ||
    final.run_number !== confirmed.run_number ||
    final.run_attempt !== confirmed.run_attempt ||
    final.status !== 'completed' ||
    final.conclusion !== 'success'
  )
    throw new Error('Main-source CI changed during release admission.');
  return { source, runId: current.id, attempt: current.run_attempt };
}
