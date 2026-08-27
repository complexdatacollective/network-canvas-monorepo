export const meta = {
  name: 'fresco-release-test',
  description:
    'Release-test the pending Fresco build locally in Docker: upgrade path from the released image (seed, migrate, export diff) plus fresh-deployment setup verification',
  whenToUse:
    'Before approving a Fresco release (merging the Version Packages PR). Requires Docker. Optional args: { keepStack, skipBuild, releasedImage, allowDirty }.',
  phases: [
    {
      title: 'Build',
      detail:
        'stage mirror tree, bundle pending packages, docker build; pull released image',
    },
    {
      title: 'Upgrade lane',
      detail:
        'seed released instance, swap to pending image, verify data + export diff',
    },
    {
      title: 'Fresh lane',
      detail: 'setup wizard end-to-end on the pending image',
    },
    { title: 'Report', detail: 'classify findings, go/no-go verdict' },
    { title: 'Teardown', detail: 'compose down unless keepStack' },
  ],
};

// ---------------------------------------------------------------------------
// Model policy (token efficiency): mechanical script-runner agents use haiku at
// low effort; browser-driving verification agents use sonnet at medium effort;
// only the two judgment-heavy agents (export-diff classification, final report
// critic) use opus at high effort. Nothing inherits the session model.
// ---------------------------------------------------------------------------
const MECHANICAL = { model: 'haiku', effort: 'low' };
const UI = { model: 'sonnet', effort: 'medium' };
const JUDGE = { model: 'opus', effort: 'high' };

const HARNESS = 'apps/fresco/release-test';
const ARTIFACTS = `${HARNESS}/artifacts`;
const BASELINE_DIR = `${ARTIFACTS}/exports/baseline`;
const UPGRADED_DIR = `${ARTIFACTS}/exports/upgraded`;
const DIFF_WORK = `${ARTIFACTS}/exports/diff`;
const SEED_PROTOCOL =
  'packages/protocols/documentation/protocols/Sample Protocol v4.netcanvas';
const ADMIN_USER = 'releasetest';
const ADMIN_PASSWORD = 'Fresco-Release-Test-1!';
const SYNTHETIC_COUNT = 5;
const UPGRADE_URL = 'http://localhost:3210';
const FRESH_URL = 'http://localhost:3211';

const keepStack = Boolean(args?.keepStack);
const skipBuild = Boolean(args?.skipBuild);
// A dirty tree means the tested image is not reproducible from any commit;
// the final verdict is capped at no-go unless the caller accepts that
// explicitly (development iterations).
const allowDirty = Boolean(args?.allowDirty);
const releasedImage =
  args?.releasedImage ?? 'ghcr.io/complexdatacollective/fresco:latest';
const pendingImage = 'fresco-release-test:pending';

const BROWSER_HOWTO = `You drive the app with the in-app Browser tools. FIRST read apps/fresco/release-test/AGENT_NOTES.md — it holds verified techniques for this exact app (protocol upload, download capture, selects, stalled dialogs); the generic approaches fail here, so follow the notes rather than rediscovering. Load browser tools ONCE with a single ToolSearch call:
ToolSearch query "select:mcp__Claude_Browser__preview_start,mcp__Claude_Browser__tabs_create,mcp__Claude_Browser__tabs_close,mcp__Claude_Browser__navigate,mcp__Claude_Browser__computer,mcp__Claude_Browser__javascript_tool,mcp__Claude_Browser__read_network_requests,mcp__Claude_Browser__resize_window,mcp__Claude_Browser__browser_batch"
Create your OWN tab with tabs_create (if the Browser pane is closed, preview_start {url: the base URL} opens it and returns a tabId), resize_window it to 1280x1100, and pass your tabId to EVERY browser call. Browser agents run one at a time in this workflow, but earlier agents may have left tabs behind — never reuse them; close your own tab when done.
Be token-frugal: one screenshot for orientation, javascript_tool for state and verification; batch predictable sequences with browser_batch.`;

const CHECK_ITEMS = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    properties: {
      name: { type: 'string' },
      pass: { type: 'boolean' },
      notes: {
        type: 'string',
        description: 'One short sentence; only when failing or surprising',
      },
    },
    required: ['name', 'pass'],
  },
};

const CHECKS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    pass: { type: 'boolean' },
    checks: CHECK_ITEMS,
    notes: { type: 'string' },
  },
  required: ['area', 'pass', 'checks'],
};

const STACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    baseUrl: { type: 'string' },
    version: { type: 'string' },
    error: {
      type: 'string',
      description: 'Only on failure: the decisive log/output lines',
    },
  },
  required: ['ok'],
};

const BUILD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean' },
    image: { type: 'string' },
    version: { type: 'string' },
    commit: { type: 'string' },
    dirty: { type: 'boolean' },
    error: { type: 'string' },
  },
  required: ['ok'],
};

const SEED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    pass: { type: 'boolean' },
    checks: CHECK_ITEMS,
    apiToken: { type: 'string' },
    apiPaths: {
      type: 'array',
      items: { type: 'string' },
      description: 'Exact API paths snapshotted, e.g. /api/v1/protocols-meta',
    },
    uiExportCaptured: { type: 'boolean' },
    networkSnapshots: {
      type: 'number',
      description: 'How many per-interview payload snapshots were saved',
    },
    counts: {
      type: 'object',
      additionalProperties: false,
      properties: {
        protocols: { type: 'number' },
        participants: { type: 'number' },
        interviews: { type: 'number' },
      },
    },
    notes: { type: 'string' },
  },
  required: ['area', 'pass', 'checks'],
};

const CAPTURE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pass: { type: 'boolean' },
    uiExportCaptured: { type: 'boolean' },
    networkSnapshots: {
      type: 'number',
      description: 'How many per-interview payload snapshots were saved',
    },
    summaryPath: { type: 'string' },
    changedFiles: { type: 'number' },
    onlyInBaseline: { type: 'number' },
    onlyInCurrent: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['pass'],
};

const DIFF_VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    pass: { type: 'boolean' },
    unanticipated: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Differences NOT explained by a pending changeset — each one sentence naming file and nature',
    },
    anticipated: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Differences explained by a pending changeset, with the changeset name',
    },
    notes: { type: 'string' },
  },
  required: ['pass', 'unanticipated', 'anticipated'],
};

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    verdict: { type: 'string', enum: ['go', 'no-go', 'blocked'] },
    failures: { type: 'array', items: { type: 'string' } },
    untestedShippedChanges: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Pending changesets shipping Fresco-facing changes that no check exercised',
    },
    summary: { type: 'string', description: 'Three sentences max' },
  },
  required: ['verdict', 'failures', 'untestedShippedChanges', 'summary'],
};

// ---------------------------------------------------------------------------

phase('Build');

const buildTasks = [
  () =>
    agent(
      `Your working directory is already the correct repository checkout — do NOT cd anywhere else (this may be a git worktree whose files are absent from the main checkout). Run: rm -rf ${ARTIFACTS} && bash ${HARNESS}/build-image.sh
This stages the Fresco mirror tree, bundles the pending workspace packages, and builds the Docker image (takes several minutes; use a generous Bash timeout of 600000). The last stdout line is a JSON stamp {image, imageId, version, commit, dirty}. Return ok:true with those fields, or ok:false with the decisive error lines (last ~30 lines of output) in "error". Do not attempt to fix a failing build.`,
      {
        label: 'build-image',
        phase: 'Build',
        schema: BUILD_SCHEMA,
        ...MECHANICAL,
      },
    ),
  () =>
    agent(
      `Run: docker pull ${releasedImage}
Then: docker image inspect --format '{{index .RepoDigests 0}}' ${releasedImage}
Return ok:true with "image" set to that digest string, or ok:false with the error in "error".`,
      {
        label: 'pull-released',
        phase: 'Build',
        schema: BUILD_SCHEMA,
        ...MECHANICAL,
      },
    ),
];
// skipBuild reuses the image from a prior build-image.sh run, but never on
// trust: the stamp on disk must match both the actual image and the current
// commit, and its dirty flag flows into the same reproducibility gate a fresh
// build gets. Anything stale fails instead of testing an unrelated image.
const validateReusedImage = () =>
  agent(
    `Your working directory is already the correct repository checkout — do NOT cd anywhere else. Validate that the existing ${pendingImage} image is the pending build of THIS tree:
1. Read ${ARTIFACTS}/stamp.json (fields: image, imageId, version, commit, dirty). If missing, return ok:false with error "no stamp — run without skipBuild".
2. Run: docker image inspect --format '{{.Id}}' ${pendingImage} — must equal the stamp's imageId.
3. Run: git rev-parse --short HEAD — must equal the stamp's commit.
4. Run: git status --porcelain — the stamp's dirty flag describes the tree AT BUILD TIME, so report "dirty" as true if EITHER the stamp says true OR this command prints anything (uncommitted changes since the build mean the image does not contain the current tree, even though HEAD matches).
Return ok:true with the stamp's image/version/commit and the combined dirty flag only if the checks in 2 and 3 both match; otherwise ok:false with which comparison failed in "error" (the fix is to rerun without skipBuild). Do not rebuild anything.`,
    {
      label: 'validate-reused-image',
      phase: 'Build',
      schema: BUILD_SCHEMA,
      ...MECHANICAL,
    },
  );
if (skipBuild) {
  log(
    'skipBuild: validating existing fresco-release-test:pending against its stamp',
  );
}
const [build, released] = await parallel(
  skipBuild ? [validateReusedImage, buildTasks[1]] : buildTasks,
);

if (!build?.ok || !released?.ok) {
  return {
    verdict: 'blocked',
    failures: [
      !build?.ok
        ? `pending image build failed: ${build?.error ?? 'agent error'}`
        : null,
      !released?.ok
        ? `released image pull failed: ${released?.error ?? 'agent error'}`
        : null,
    ].filter(Boolean),
    build,
    released,
  };
}

// ---------------------------------------------------------------------------

const runUpgradeLane = async () => {
  const lane = { name: 'upgrade' };

  const upReleased = await agent(
    `Your working directory is already the correct repository checkout — do NOT cd anywhere else (this may be a git worktree whose files are absent from the main checkout). Run: rm -rf ${ARTIFACTS}/exports && bash ${HARNESS}/up.sh --lane upgrade --image ${releasedImage}
(The rm clears any previous run's export captures so the diff can never mix runs — required because skipBuild bypasses the build step's artifact cleanup. Bash timeout 480000 — first boot runs migrations.) The last stdout line is JSON with baseUrl and the health response. Return ok:true with baseUrl and the health "version" field, or ok:false with the decisive error lines in "error".`,
    {
      label: 'up-released',
      phase: 'Upgrade lane',
      schema: STACK_SCHEMA,
      ...MECHANICAL,
    },
  );
  lane.upReleased = upReleased;
  if (!upReleased?.ok) return lane;

  const seed = await agent(
    `You are seeding a fresh Fresco instance (the CURRENTLY RELEASED version, ${upReleased.version ?? 'unknown'}) at ${UPGRADE_URL} so an upgrade can be tested against real data. Stay in your working directory — it is already the correct repository checkout; do NOT cd to another checkout.
${BROWSER_HOWTO}

Do, in order, recording a check {name, pass} for each numbered step:
1. Setup wizard: create the administrator account (username ${ADMIN_USER}, password ${ADMIN_PASSWORD}; choose the Password authentication method).
2. Storage step: choose "S3 / S3-Compatible" and enter: Endpoint URL http://minio:9000, Public URL http://localhost:9310, Bucket fresco-test, Region us-east-1, Access Key ID minioadmin, Secret Access Key minioadmin. (This mirrors the documented production bundled-MinIO setup.)
3. Protocol step: stage the seed protocol with: bash ${HARNESS}/stage-fixture.sh --lane upgrade --file "${SEED_PROTOCOL}" --name sample-v4.netcanvas — then inject it per AGENT_NOTES (fetch the printed URL → File → set input.files → dispatch change). Confirm the import succeeded via the presigned PUTs in the network log AND the protocol appearing (dashboard count or psql per AGENT_NOTES) — the dropzone UI may not visibly react.
4. Finish the wizard to the dashboard.
5. In settings, generate ${SYNTHETIC_COUNT} synthetic interviews via the Synthetic Interview Data section (native select + number input per AGENT_NOTES); wait for the completion toast.
6. In settings, enable the interview data API if it has an enable toggle, and create an API token. Record the token value.
7. Snapshot the API: mkdir -p ${BASELINE_DIR}, then for each documented interview-data API endpoint (the settings page documents the paths; expect something like /api/v1/protocols-meta and /api/v1/interview) run curl -fsS -H "Authorization: Bearer <token>" ${UPGRADE_URL}<path> and save to ${BASELINE_DIR}/api-<last-path-segment>.json. Record the exact paths you used in apiPaths. Then, because the interview COLLECTION endpoint returns metadata only, snapshot the stored network payload of EVERY interview: take the ids from the collection response and curl /api/v1/interview/<id> for each, saving to ${BASELINE_DIR}/api-interview-<id>.json. Record how many succeeded in networkSnapshots.
8. Export ALL interviews via the interviews page UI, capturing the zip with the blob-hook technique in AGENT_NOTES: run bash ${HARNESS}/enable-captures.sh --lane upgrade, install the createObjectURL hook, drive the export menu + "Confirm File Export Options" dialog (leave every format toggle on), PUT the captured blob to <capture base>/baseline-ui-export.zip, and curl it to ${BASELINE_DIR}/ui-export.zip on the host. If no blob is captured, set uiExportCaptured:false and continue — the API snapshots still enable the diff.
9. Record the dashboard counts (protocols, participants, interviews) in counts.

pass=true only if steps 1-5 succeeded (the instance is seeded); report the rest honestly. Keep notes short.`,
    {
      label: 'seed-baseline',
      phase: 'Upgrade lane',
      schema: SEED_SCHEMA,
      ...UI,
    },
  );
  lane.seed = seed;
  if (!seed?.pass) return lane;

  const swap = await agent(
    `Upgrade the running release-test stack to the pending image, exactly as a deployment would:
Run: bash ${HARNESS}/up.sh --lane upgrade --image ${pendingImage} --keep-data
(Bash timeout 480000.) Then run: FRESCO_IMAGE=${pendingImage} docker compose -p fresco-release-test-upgrade -f ${HARNESS}/docker-compose.yml logs --tail 200 fresco
(The FRESCO_IMAGE prefix is required: the compose file refuses interpolation without it, and up.sh's export does not survive into your shell.)
Inspect the logs for the migration/startup sequence (prisma migrate deploy, protocol/data migrations, server start). Return ok:true with the health "version", or ok:false with the decisive failing log lines in "error". Any migration error, stack trace, or crash-loop is a failure even if the container eventually reports healthy.`,
    {
      label: 'upgrade-swap',
      phase: 'Upgrade lane',
      schema: STACK_SCHEMA,
      ...MECHANICAL,
    },
  );
  lane.swap = swap;
  if (!swap?.ok) return lane;

  const apiPaths = JSON.stringify(seed.apiPaths ?? []);
  // Strictly serialized, twice over: capture and integrity must observe the
  // upgraded-but-untouched dataset before the mutating CRUD and settings
  // checks run (a deleted interview or toggled setting would race the export
  // diff and count checks into a schedule-dependent false no-go), and browser
  // agents must not run concurrently at all — a backgrounded tab in this
  // environment goes dead (see AGENT_NOTES.md).
  const capture = await agent(
    `The Fresco instance at ${UPGRADE_URL} was just upgraded; its data was seeded pre-upgrade. Capture the SAME exports that were captured before the upgrade, then run the deterministic diff. Stay in your working directory — it is already the correct repository checkout; do NOT cd to another checkout. Sign in as ${ADMIN_USER} / ${ADMIN_PASSWORD} if asked.
${BROWSER_HOWTO}

1. mkdir -p ${UPGRADED_DIR}
2. Snapshot the API exactly as the baseline did: paths ${apiPaths}, with curl -fsS -H "Authorization: Bearer ${seed.apiToken ?? '<missing>'}" ${UPGRADE_URL}<path> saved to ${UPGRADED_DIR}/api-<last-path-segment>.json (same filenames as in ${BASELINE_DIR}). Then snapshot every per-interview payload exactly as the baseline did: for each api-interview-<id>.json in ${BASELINE_DIR}, curl /api/v1/interview/<id> to ${UPGRADED_DIR}/api-interview-<id>.json (these carry the stored network; the collection endpoint is metadata only). Record how many succeeded in networkSnapshots.
3. In the browser, export ALL interviews from the interviews page with the SAME options as the baseline export (every format toggle on), using the blob-hook capture in AGENT_NOTES (enable-captures.sh --lane upgrade is idempotent; install the hook BEFORE triggering the export); PUT the blob to <capture base>/upgraded-ui-export.zip and curl it to ${UPGRADED_DIR}/ui-export.zip. Only do this if ${BASELINE_DIR}/ui-export.zip exists — otherwise skip so the two sides stay comparable; if the blob capture fails, set uiExportCaptured:false.
4. Run: node ${HARNESS}/scripts/diff-exports.mjs ${BASELINE_DIR} ${UPGRADED_DIR} --work ${DIFF_WORK} --out ${ARTIFACTS}/exports/diff-summary.json
5. Return pass:true if capture and diff both ran; summaryPath=${ARTIFACTS}/exports/diff-summary.json plus the changedFiles / onlyInBaseline / onlyInCurrent counts from the summary. Do NOT paste diff content.`,
    {
      label: 'export-capture',
      phase: 'Upgrade lane',
      schema: CAPTURE_SCHEMA,
      ...UI,
    },
  );
  // The diff cannot run without a summary: a schema-valid capture that omits
  // summaryPath is a FAILED capture, never a silent skip of the gate.
  if (capture?.pass && !capture.summaryPath) {
    capture.pass = false;
    capture.notes = `${capture.notes ?? ''} [capture returned pass without summaryPath — treated as failed; the export diff cannot run]`;
  }
  // And it cannot gate anything without network-bearing content covering
  // EVERY seeded interview: the interview COLLECTION endpoint is
  // metadata-only, and a matching partial subset of payload snapshots on both
  // sides would diff clean while corruption in the omitted interviews goes
  // undetected. Without the UI archive, both passes must have snapshotted the
  // full seeded set.
  const expectedNetworks = seed?.counts?.interviews ?? SYNTHETIC_COUNT;
  if (
    capture?.pass &&
    !capture.uiExportCaptured &&
    !(
      (capture.networkSnapshots ?? 0) >= expectedNetworks &&
      (seed.networkSnapshots ?? 0) >= expectedNetworks
    )
  ) {
    capture.pass = false;
    capture.notes = `${capture.notes ?? ''} [no UI export archive and per-interview payload snapshots are incomplete (need ${expectedNetworks} on both sides; baseline ${seed.networkSnapshots ?? 0}, upgraded ${capture.networkSnapshots ?? 0}) — a partial or metadata-only diff cannot detect network corruption]`;
  }

  const integrity = await agent(
    `Verify data survived a Fresco upgrade at ${UPGRADE_URL}. Sign in as ${ADMIN_USER} / ${ADMIN_PASSWORD}. Pre-upgrade the instance had counts ${JSON.stringify(seed.counts ?? {})} (protocols include "Sample Protocol"; interviews are ${SYNTHETIC_COUNT} synthetic ones).
${BROWSER_HOWTO}
Checks: dashboard summary counts match the pre-upgrade counts; the protocols page lists the seeded protocol; the interviews page lists the synthetic interviews; the participants page loads; the activity feed still shows pre-upgrade events (protocol upload, interview generation); settings values set during seeding are unchanged; a persisted interview still RESUMES on the upgraded build — open one seeded incomplete interview at its /interview/<id> URL (id from the interviews table or psql per AGENT_NOTES) and verify the interview shell renders its current stage without an error screen. Then provoke a sync: the sync middleware only fires on a session STATE CHANGE, so an untouched stage sends nothing — use the shell's forward/back navigation control (shell chrome, not stage content) to advance or step the stage, and confirm a request to /interview/<id>/sync succeeds in the network log. If stage validation blocks navigation both ways, the render check alone passes this item — note that sync could not be provoked rather than failing it. Do NOT interact with stage content; this exercises Fresco's payload mapping and schema-version compatibility gate, not interview behaviour (the interview package covers that). Return one check per item.`,
    {
      label: 'verify-data-integrity',
      phase: 'Upgrade lane',
      schema: CHECKS_SCHEMA,
      ...UI,
    },
  );
  const crud = await agent(
    `Exercise Fresco dashboard CRUD on the upgraded instance at ${UPGRADE_URL}. Sign in as ${ADMIN_USER} / ${ADMIN_PASSWORD}. Use data prefixed "crud-" so you never touch other agents' data; stay in your working directory for any files.
${BROWSER_HOWTO}
Checks: create a participant (crud-p1) and see it listed; edit its label; import participants from a small CSV you create (use the format the import dialog documents; 2 rows, identifiers crud-csv1/crud-csv2); export participants — install the blob hook from AGENT_NOTES first and confirm a CSV blob is captured (real downloads abort in this browser; a captured blob IS success); delete crud-p1; upload a second protocol (stage packages/protocols/e2e/interviewer-e2e/interviewer-e2e.netcanvas via stage-fixture.sh --lane upgrade and inject per AGENT_NOTES) and then delete it from the protocols page; delete ONE synthetic interview from the interviews page and confirm the row count drops. Return one check per operation.`,
    {
      label: 'verify-crud',
      phase: 'Upgrade lane',
      schema: CHECKS_SCHEMA,
      ...UI,
    },
  );
  const apiSettings = await agent(
    `Exercise Fresco's API and settings on the upgraded instance at ${UPGRADE_URL}. Sign in as ${ADMIN_USER} / ${ADMIN_PASSWORD} for browser steps; API token: ${seed.apiToken ?? '<missing — create a new one in settings and note that in your result>'}.
${BROWSER_HOWTO}
Checks:
- curl ${UPGRADE_URL}/api/health returns 200 healthy.
- The pre-upgrade API token still authenticates: one documented interview-data endpoint returns well-formed JSON (curl with the Bearer token).
- An invalid token gets 401/403.
- Toggle one interview setting (e.g. limit interviews) off/on in settings and confirm it persists across a page reload.
- Enable anonymous recruitment, then curl -sI "${UPGRADE_URL}/onboard/<protocolId>" (find a protocol id via the recruitment/test section in settings or the protocols page URL/copy-link affordance): expect a redirect into a new interview. Disable anonymous recruitment and repeat: expect the no-anonymous-recruitment outcome. Do NOT drive interview stages — redirect-level only.
Return one check per item.`,
    {
      label: 'verify-api-settings',
      phase: 'Upgrade lane',
      schema: CHECKS_SCHEMA,
      ...UI,
    },
  );
  lane.capture = capture;
  lane.integrity = integrity;
  lane.crud = crud;
  lane.apiSettings = apiSettings;

  if (capture?.pass && capture.summaryPath) {
    lane.diffVerdict = await agent(
      `You are judging whether a Fresco upgrade changed exported interview data in UNANTICIPATED ways. The same seeded interviews were exported before the upgrade (released build) and after (pending build); a deterministic normalizer already masked ONLY the volatile export-marking fields (GraphML sessionExportTime, CSV sessionExported, JSON lastUpdated/exportTime) and id-sorted API arrays — stable persisted times (sessionStart/sessionFinish, startTime/finishTime) are compared literally, so a difference in them is real. It produced ${capture.summaryPath} (JSON: onlyInBaseline / onlyInCurrent / identical / changed with per-file diff excerpts and fullDiff paths under ${DIFF_WORK}/diffs/).
Read the summary. For every difference, read as much of the full diff as needed to characterize it. Then read the pending changesets (.changeset/*.md in your working directory) — they describe everything this release ships. Classify each difference as anticipated (explained by a specific changeset — name it) or unanticipated. Structural changes to graph data (missing nodes/edges/attributes, changed values) are unanticipated unless a changeset explicitly covers them. An empty diff (all identical, nothing one-sided) is pass:true with empty lists. pass=false if anything is unanticipated.`,
      {
        label: 'diff-judge',
        phase: 'Upgrade lane',
        schema: DIFF_VERDICT_SCHEMA,
        ...JUDGE,
      },
    );
  }
  return lane;
};

const runFreshLane = async () => {
  const lane = { name: 'fresh' };

  const up = await agent(
    `Your working directory is already the correct repository checkout — do NOT cd anywhere else (this may be a git worktree whose files are absent from the main checkout). Run: bash ${HARNESS}/up.sh --lane fresh --image ${pendingImage}
(Bash timeout 480000.) The last stdout line is JSON with baseUrl and health. Return ok:true with baseUrl and health "version", or ok:false with the decisive error lines in "error".`,
    {
      label: 'up-fresh',
      phase: 'Fresh lane',
      schema: STACK_SCHEMA,
      ...MECHANICAL,
    },
  );
  lane.up = up;
  if (!up?.ok) return lane;

  lane.setup = await agent(
    `Verify the NEW-DEPLOYMENT setup process of the pending Fresco release at ${FRESH_URL} (a completely fresh instance). Stay in your working directory — it is already the correct repository checkout; do NOT cd to another checkout.
${BROWSER_HOWTO}

Checks, in order:
1. Visiting ${FRESH_URL} redirects to the setup wizard.
2. Account step rejects a weak password (try "password") with visible validation feedback (choose the Password authentication method).
3. Account creation succeeds with username ${ADMIN_USER}, password ${ADMIN_PASSWORD}.
4. Storage step accepts the S3 configuration: Endpoint URL http://minio:9000, Public URL http://localhost:9311, Bucket fresco-test, Region us-east-1, keys minioadmin/minioadmin.
5. Protocol step: stage the protocol with bash ${HARNESS}/stage-fixture.sh --lane fresh --file "${SEED_PROTOCOL}" --name sample-v4.netcanvas and inject per AGENT_NOTES; the presigned MinIO PUTs (network log) and the imported protocol prove the storage pipeline.
6. Completing the wizard lands on the dashboard.
7. Sign out; sign-in rejects a wrong password; sign-in succeeds with the right one.
8. The setup wizard is no longer reachable once configured (navigating to /setup does not offer account creation again).
9. The uploaded protocol is listed on the protocols page.
10. In settings, create an API token (enable the data API if needed) and curl one documented endpoint with it: well-formed JSON.
Return one check per item; pass=true only if all pass.`,
    {
      label: 'verify-fresh-setup',
      phase: 'Fresh lane',
      schema: CHECKS_SCHEMA,
      ...UI,
    },
  );
  return lane;
};

let upgradeLane;
let freshLane;
let report;
let teardown;
try {
  // Sequential on purpose: the in-app browser backgrounds all but one tab and
  // backgrounded tabs go dead (AGENT_NOTES.md), so concurrent browser-driving
  // lanes trade reliability (and token-burning tab recovery) for wall-clock.
  upgradeLane = await runUpgradeLane();
  freshLane = await runFreshLane();

  phase('Report');
  report = await agent(
    `You are the release-gate critic for a Fresco release test. The pending build was tested two ways: an upgrade from the released image (seed → migrate → verify → export diff) and a fresh-deployment setup. Full structured results:
${JSON.stringify({ build, released, upgradeLane, freshLane }, null, 2)}

Also read the pending changesets (.changeset/*.md in your working directory) and note any that ship Fresco-facing behaviour no check above exercised (list them in untestedShippedChanges; library-only or other-app changesets do not belong there).
Verdict rules: "blocked" if a stack or the build never came up (nothing meaningful was tested); "no-go" if any check failed, any migration error appeared, the export diff has unanticipated differences, or the pending image was built from a dirty tree (build.dirty) without allowDirty=${allowDirty} — a dirty build is not reproducible from any commit; otherwise "go". List every failure verbatim from the results — do not soften or re-litigate them.`,
    {
      label: 'release-critic',
      phase: 'Report',
      schema: REPORT_SCHEMA,
      ...JUDGE,
    },
  );
} finally {
  phase('Teardown');
  if (keepStack) {
    log(
      `keepStack: leaving stacks running (${UPGRADE_URL} upgraded, ${FRESH_URL} fresh); run bash ${HARNESS}/down.sh when finished`,
    );
  } else {
    teardown = await agent(
      `Your working directory is already the correct repository checkout — do NOT cd anywhere else (this may be a git worktree whose files are absent from the main checkout). Run: bash ${HARNESS}/down.sh
Then verify nothing remains: docker ps -a and docker volume ls filtered for "fresco-release-test" must be empty. Return ok:true, or ok:false with what remained in "error".`,
      {
        label: 'teardown',
        phase: 'Teardown',
        schema: STACK_SCHEMA,
        ...MECHANICAL,
      },
    );
  }
}

// Deterministic enforcement on top of the critic's judgment: a dirty build or
// a failed teardown must be visible in the returned verdict/failures even if
// the critic's prose missed them.
const failures = [
  ...(report?.failures ?? ['release-critic agent did not return']),
];
let verdict = report?.verdict ?? 'blocked';
if (build?.dirty && !allowDirty && verdict === 'go') {
  verdict = 'no-go';
  failures.push(
    'pending image was built from a dirty working tree — not reproducible from any commit (rerun clean, or pass allowDirty during development)',
  );
}
// The export diff is the central upgrade regression gate: once the swap ran,
// a run without a diff verdict (failed capture, missing summary, judge never
// invoked) must not read as a pass — and neither can an unanticipated diff,
// whatever the critic's prose concluded.
if (upgradeLane?.swap?.ok && upgradeLane?.diffVerdict?.pass !== true) {
  const reason = upgradeLane?.diffVerdict
    ? `unanticipated export differences: ${(upgradeLane.diffVerdict.unanticipated ?? []).join('; ')}`
    : 'the export diff never reached a verdict (capture failed or its summary was missing)';
  failures.push(`export regression gate: ${reason}`);
  if (verdict === 'go') verdict = 'no-go';
}
// Teardown hygiene is reported separately from release quality: leftover
// local containers say nothing about whether the candidate is safe to
// publish, so they never flip a go — but they must never hide inside a "go"
// result either, hence the distinct warnings channel (failures stays strictly
// release-gating, so verdict "go" implies failures is empty).
const warnings = [];
if (!keepStack && teardown?.ok !== true) {
  warnings.push(
    `teardown did not verify clean: ${teardown?.error ?? 'teardown agent returned no result'} — release-test containers/volumes may still be running and can break the next run (bash ${HARNESS}/down.sh to clean up)`,
  );
}

return {
  verdict,
  summary: report?.summary,
  failures,
  warnings,
  untestedShippedChanges: report?.untestedShippedChanges ?? [],
  pendingImage: { ...build },
  releasedImage: released?.image,
  upgradeLane,
  freshLane,
  artifacts: ARTIFACTS,
  teardown: keepStack ? 'stacks deliberately kept' : teardown,
  stacksKept: keepStack,
};
