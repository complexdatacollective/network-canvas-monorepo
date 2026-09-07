export function successfulRun(source, overrides = {}) {
  return {
    id: 12,
    run_number: 9,
    run_attempt: 1,
    head_sha: source,
    head_branch: 'main',
    event: 'push',
    path: '.github/workflows/ci-and-release.yml',
    repository: { full_name: 'complexdatacollective/network-canvas-monorepo' },
    head_repository: {
      full_name: 'complexdatacollective/network-canvas-monorepo',
    },
    status: 'completed',
    conclusion: 'success',
    ...overrides,
  };
}

export function successfulCIRequest(source) {
  return async ({ query }) => ({
    bytes: Buffer.from(
      JSON.stringify(
        query
          ? { total_count: 1, workflow_runs: [successfulRun(source)] }
          : successfulRun(source),
      ),
    ),
  });
}
