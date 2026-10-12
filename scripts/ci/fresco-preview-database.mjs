#!/usr/bin/env node

// Gives each Fresco deploy preview its own database: a Neon branch of the
// database its pull request's base uses. A pull request into main branches
// the database main's production deploy uses; a pull request into another
// branch (schema-9, say) branches the preview database of that branch, so a
// stack of pull requests stacks its databases the same way.
//
// The branch-scoped Netlify values this writes are the only database a
// preview can see: the site's DATABASE_URL and DATABASE_URL_UNPOOLED are set
// for production alone. PREVIEW_DATABASE_BRANCH names the Neon branch, and
// apps/fresco/scripts/build-preview.ts migrates a preview's database only when
// it names this preview's own branch.

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PRODUCTION_BRANCH = 'main';
export const PREVIEW_DATABASE_KEY = 'PREVIEW_DATABASE_BRANCH';
const DATABASE_KEYS = ['DATABASE_URL', 'DATABASE_URL_UNPOOLED'];

const NEON_API = 'https://console.neon.tech/api/v2';
const NETLIFY_API = 'https://api.netlify.com/api/v1';
const OPERATION_POLL_MS = 2000;
const OPERATION_TIMEOUT_MS = 5 * 60 * 1000;

export function previewBranchName(gitBranch) {
  return `preview/${gitBranch}`;
}

/**
 * The Neon branch a preview of `base`'s pull request is copied from: the
 * project's default branch for main, otherwise the preview database of the
 * base branch itself. Null when the base has no preview database.
 */
export function parentBranchFor(branches, base) {
  if (base === PRODUCTION_BRANCH) {
    const production = branches.find((branch) => branch.default);
    if (!production) {
      throw new Error('The Neon project has no default branch to copy.');
    }
    return production;
  }
  const name = previewBranchName(base);
  return branches.find((branch) => branch.name === name) ?? null;
}

/**
 * Decide what provisioning `head`'s preview takes: keep its database, create
 * one, replace one that was copied from a different base (the pull request
 * was retargeted), or nothing, when the base has no database to copy — a pull
 * request into a branch that has no preview of its own gets no preview
 * either, because Netlify skips a build that has no database.
 */
export function planProvision({ branches, head, base }) {
  if (head === PRODUCTION_BRANCH) {
    throw new Error(`${PRODUCTION_BRANCH} never gets a preview database.`);
  }

  const name = previewBranchName(head);
  const existing = branches.find((branch) => branch.name === name) ?? null;
  const parent = parentBranchFor(branches, base);
  if (!parent) {
    return {
      action: 'unavailable',
      name,
      existing,
      reason:
        `${base} has no preview database (${previewBranchName(base)}), so ` +
        `there is nothing to copy for this pull request. A pull request for ` +
        `${base} that changes Fresco creates one.`,
    };
  }
  if (!existing) return { action: 'create', name, parent, existing: null };
  if (existing.parent_id === parent.id) {
    return { action: 'keep', name, parent, existing };
  }

  const children = branches.filter(
    (branch) => branch.parent_id === existing.id,
  );
  if (children.length > 0) {
    throw new Error(
      `${name} was copied from a different base, but it cannot be replaced ` +
        `while ${children.map((child) => child.name).join(', ')} ` +
        `${children.length === 1 ? 'is' : 'are'} copied from it.`,
    );
  }
  return { action: 'recreate', name, parent, existing };
}

export function planTeardown({ branches, head }) {
  const name = previewBranchName(head);
  const branch = branches.find((candidate) => candidate.name === name) ?? null;
  const children = branch
    ? branches.filter((candidate) => candidate.parent_id === branch.id)
    : [];
  return { name, branch, children };
}

async function request(fetchImpl, url, { token, method = 'GET', body } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok) {
    // The URL never carries a secret; the body may, so it is not echoed.
    throw new Error(`${method} ${url} failed with HTTP ${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export function createNeon({ apiKey, projectId, fetchImpl = fetch, sleep }) {
  const project = `${NEON_API}/projects/${projectId}`;
  const call = (path, options) =>
    request(fetchImpl, `${project}${path}`, { token: apiKey, ...options });
  const wait = sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));

  async function awaitOperations(operations = []) {
    for (const { id } of operations) {
      const deadline = Date.now() + OPERATION_TIMEOUT_MS;
      for (;;) {
        const { operation } = await call(`/operations/${id}`);
        if (operation.status === 'finished') break;
        if (['failed', 'error', 'cancelled'].includes(operation.status)) {
          throw new Error(
            `Neon operation ${operation.action} ${operation.status}`,
          );
        }
        if (Date.now() > deadline) {
          throw new Error(`Neon operation ${operation.action} timed out`);
        }
        await wait(OPERATION_POLL_MS);
      }
    }
  }

  return {
    async listBranches() {
      return (await call('/branches')).branches;
    },
    async createBranch({ name, parentId }) {
      const result = await call('/branches', {
        method: 'POST',
        body: {
          branch: { name, parent_id: parentId },
          endpoints: [{ type: 'read_write' }],
        },
      });
      await awaitOperations(result.operations);
      return result.branch;
    },
    async deleteBranch(branchId) {
      const result = await call(`/branches/${branchId}`, { method: 'DELETE' });
      await awaitOperations(result?.operations);
    },
    async connectionUris(branchId) {
      const { databases } = await call(`/branches/${branchId}/databases`);
      const database = databases[0];
      if (!database) throw new Error('The Neon branch has no database.');
      const uri = async (pooled) => {
        const query = new URLSearchParams({
          branch_id: branchId,
          database_name: database.name,
          role_name: database.owner_name,
          pooled: String(pooled),
        });
        return (await call(`/connection_uri?${query}`)).uri;
      };
      return { pooled: await uri(true), unpooled: await uri(false) };
    },
  };
}

export function createNetlify({ token, siteId, fetchImpl = fetch }) {
  const call = (url, options) => request(fetchImpl, url, { token, ...options });
  let accountId;
  const envUrl = async (suffix = '') => {
    accountId ??= (await call(`${NETLIFY_API}/sites/${siteId}`)).account_id;
    return `${NETLIFY_API}/accounts/${accountId}/env${suffix}?site_id=${siteId}`;
  };
  const isBranchValue = (gitBranch) => (value) =>
    value.context === 'branch' && value.context_parameter === gitBranch;

  return {
    /** Returns true when the stored value changed. */
    async setBranchValue({ key, gitBranch, value, secret }) {
      const current = await call(await envUrl(`/${key}`));
      if (!current) {
        await call(await envUrl(), {
          method: 'POST',
          body: [
            {
              key,
              scopes: ['builds', 'functions', 'runtime'],
              is_secret: secret,
              values: [
                { context: 'branch', context_parameter: gitBranch, value },
              ],
            },
          ],
        });
        return true;
      }
      // A secret's stored value reads back masked, so it cannot be compared;
      // the database URLs only change when the Neon branch does, which the
      // caller already knows about.
      const stored = current.values.find(isBranchValue(gitBranch));
      if (stored && !current.is_secret && stored.value === value) return false;
      await call(await envUrl(`/${key}`), {
        method: 'PATCH',
        body: { context: 'branch', context_parameter: gitBranch, value },
      });
      return !stored || !current.is_secret;
    },
    async deleteBranchValues({ key, gitBranch }) {
      const current = await call(await envUrl(`/${key}`));
      for (const value of current?.values.filter(isBranchValue(gitBranch)) ??
        []) {
        await call(await envUrl(`/${key}/value/${value.id}`), {
          method: 'DELETE',
        });
      }
    },
    async triggerBuild(gitBranch) {
      // createSiteBuild takes the branch as a query parameter, and builds
      // production without one. Netlify has no call that re-runs a skipped
      // Deploy Preview, so this is a branch deploy of the same branch, which
      // reads the same branch-scoped database; the pull request's next push
      // builds its Deploy Preview as usual.
      const query = new URLSearchParams({ branch: gitBranch });
      return call(`${NETLIFY_API}/sites/${siteId}/builds?${query}`, {
        method: 'POST',
      });
    },
  };
}

export function createGitHub({ token, repository, fetchImpl = fetch }) {
  const owner = repository.split('/')[0];
  return {
    /** Open pull requests from `head`, other than pull request `exclude`. */
    async otherOpenPullRequests(head, exclude) {
      const query = new URLSearchParams({
        state: 'open',
        head: `${owner}:${head}`,
        per_page: '100',
      });
      const pulls = await request(
        fetchImpl,
        `https://api.github.com/repos/${repository}/pulls?${query}`,
        { token },
      );
      return pulls
        .filter((pull) => pull.number !== exclude)
        .map((pull) => ({ number: pull.number, base: pull.base.ref }));
    },
    /** Open pull requests from this repository into `base`. */
    async openPullRequestsInto(base) {
      const query = new URLSearchParams({
        state: 'open',
        base,
        per_page: '100',
      });
      const pulls = await request(
        fetchImpl,
        `https://api.github.com/repos/${repository}/pulls?${query}`,
        { token },
      );
      return pulls
        .filter((pull) => pull.head.repo?.full_name === repository)
        .map((pull) => ({
          number: pull.number,
          head: pull.head.ref,
          base: pull.base.ref,
          headSha: pull.head.sha,
          baseSha: pull.base.sha,
        }));
    },
  };
}

/**
 * Netlify scopes values to a git branch, not to a pull request, so pull
 * requests that share a head branch share its preview database. While more
 * than one is open, none of them may replace or remove it.
 */
function sharedWarning(name, head, others) {
  const list = others
    .map((pull) => `#${pull.number} (into ${pull.base})`)
    .join(', ');
  return (
    `::warning::Leaving ${name} as it is: ${head} is also the head of ` +
    `${list}, and those pull requests share its preview database. It is ` +
    `replaced or removed once ${head} backs a single open pull request.`
  );
}

export async function provision({
  neon,
  netlify,
  head,
  base,
  otherPullRequests = [],
  log,
  mask,
}) {
  const plan = planProvision({
    branches: await neon.listBranches(),
    head,
    base,
  });
  if (plan.existing && plan.action !== 'keep' && otherPullRequests.length > 0) {
    log(sharedWarning(plan.name, head, otherPullRequests));
    return { action: 'shared', name: plan.name, parent: null, build: false };
  }
  if (plan.action === 'unavailable') {
    log(`::warning::${plan.reason}`);
    // A pull request retargeted onto such a base still has the database it
    // copied from its old one; left in place, its marker would keep the
    // preview building against that copy.
    if (plan.existing) await teardown({ neon, netlify, head, log });
    return { action: plan.action, name: plan.name, parent: null, build: false };
  }

  let branch = plan.existing;
  if (plan.action === 'recreate') {
    log(`Replacing ${plan.name}: its pull request now targets ${base}.`);
    await neon.deleteBranch(plan.existing.id);
  }
  if (plan.action !== 'keep') {
    log(`Creating ${plan.name} from ${plan.parent.name}.`);
    branch = await neon.createBranch({
      name: plan.name,
      parentId: plan.parent.id,
    });
  } else {
    log(`Keeping ${plan.name} (copied from ${plan.parent.name}).`);
  }

  const uris = await neon.connectionUris(branch.id);
  mask(uris.pooled);
  mask(uris.unpooled);

  const replaced = plan.action !== 'keep';
  const changes = await Promise.all([
    netlify.setBranchValue({
      key: 'DATABASE_URL',
      gitBranch: head,
      value: uris.pooled,
      secret: true,
    }),
    netlify.setBranchValue({
      key: 'DATABASE_URL_UNPOOLED',
      gitBranch: head,
      value: uris.unpooled,
      secret: true,
    }),
    netlify.setBranchValue({
      key: PREVIEW_DATABASE_KEY,
      gitBranch: head,
      value: plan.name,
      secret: false,
    }),
  ]);

  // Netlify builds every push itself, but a build that started before this
  // preview had a database was skipped (netlify-should-build.sh), and one that
  // started before a replacement was pointed at the old database.
  const build = replaced || changes.some(Boolean);
  if (build) {
    await netlify.triggerBuild(head);
    log(`Triggered a Netlify build of ${head}.`);
  }

  return {
    action: plan.action,
    name: plan.name,
    parent: plan.parent.name,
    build,
  };
}

export async function teardown({
  neon,
  netlify,
  head,
  otherPullRequests = [],
  log,
}) {
  if (otherPullRequests.length > 0) {
    log(sharedWarning(previewBranchName(head), head, otherPullRequests));
    return { deleted: false, name: previewBranchName(head) };
  }
  // Remove the values first, so no build starts against a deleted database.
  for (const key of [...DATABASE_KEYS, PREVIEW_DATABASE_KEY]) {
    await netlify.deleteBranchValues({ key, gitBranch: head });
  }

  const plan = planTeardown({ branches: await neon.listBranches(), head });
  if (!plan.branch) {
    log(`${plan.name} does not exist; nothing to delete.`);
    return { deleted: false, name: plan.name };
  }
  if (plan.children.length > 0) {
    log(
      `::warning::Keeping ${plan.name}: ` +
        `${plan.children.map((child) => child.name).join(', ')} ` +
        `${plan.children.length === 1 ? 'is' : 'are'} copied from it. ` +
        `Delete it in Neon once those pull requests close.`,
    );
    return { deleted: false, name: plan.name };
  }
  await neon.deleteBranch(plan.branch.id);
  log(`Deleted ${plan.name}.`);
  return { deleted: true, name: plan.name };
}

/**
 * Bring one pull request's preview database in line with the pull request:
 * a copy of its base's database while it changes Fresco, nothing otherwise.
 * A database created here is also the base for any open pull request into
 * this branch that found nothing to copy, so those are brought in line too.
 */
export async function syncPullRequest({
  pr,
  neon,
  netlify,
  github,
  isAffected,
  log,
  mask,
}) {
  const otherPullRequests = await github.otherOpenPullRequests(
    pr.head,
    pr.number,
  );

  // A pull request that no longer changes Fresco (a later push, or a
  // retarget) keeps no database: left in place, a copy of a former base would
  // go on backing its preview.
  if (!(await isAffected(pr.baseSha, pr.headSha))) {
    log(`#${pr.number} does not change Fresco.`);
    await teardown({ neon, netlify, head: pr.head, otherPullRequests, log });
    return { action: 'unaffected', name: previewBranchName(pr.head) };
  }

  const result = await provision({
    neon,
    netlify,
    head: pr.head,
    base: pr.base,
    otherPullRequests,
    log,
    mask,
  });

  if (result.action === 'create' || result.action === 'recreate') {
    for (const child of await github.openPullRequestsInto(pr.head)) {
      log(`Bringing #${child.number}, which targets ${pr.head}, in line.`);
      await syncPullRequest({
        pr: child,
        neon,
        netlify,
        github,
        isAffected,
        log,
        mask,
      });
    }
  }
  return result;
}

/**
 * Whether the pull request changes Fresco, by the same `turbo query affected`
 * check the Netlify deploy-preview ignore command makes.
 */
function turboIsAffected(baseSha, headSha) {
  const turboVersion = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ).devDependencies.turbo;
  // A pull request brought in line from its base's run may have commits this
  // checkout has not seen.
  execFileSync('git', ['fetch', '--quiet', 'origin', baseSha, headSha]);
  try {
    execFileSync(
      'npx',
      [
        '--yes',
        `turbo@${turboVersion}`,
        'query',
        'affected',
        '--tasks',
        'build',
        '--packages',
        'fresco',
        '--base',
        baseSha,
        '--head',
        headSha,
        '--exit-code',
      ],
      { stdio: 'ignore' },
    );
    return false;
  } catch (error) {
    if (error.status === 1) return true;
    throw error;
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredEnv(name) {
  // eslint-disable-next-line no-process-env
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function runCli() {
  const [command, ...args] = process.argv.slice(2);
  const neon = createNeon({
    apiKey: requiredEnv('NEON_API_KEY'),
    projectId: requiredEnv('NEON_PROJECT_ID'),
  });
  const netlify = createNetlify({
    token: requiredEnv('NETLIFY_AUTH_TOKEN'),
    siteId: requiredEnv('NETLIFY_SITE_ID'),
  });
  const github = createGitHub({
    token: requiredEnv('GITHUB_TOKEN'),
    repository: requiredEnv('GITHUB_REPOSITORY'),
  });
  const log = (line) => console.log(line);
  const mask = (secret) => console.log(`::add-mask::${secret}`);
  const pr = {
    number: Number(option(args, '--pr')),
    head: option(args, '--head'),
  };

  let summary;
  if (command === 'sync') {
    const result = await syncPullRequest({
      pr: {
        ...pr,
        base: option(args, '--base'),
        baseSha: option(args, '--base-sha'),
        headSha: option(args, '--head-sha'),
      },
      neon,
      netlify,
      github,
      isAffected: async (baseSha, headSha) => turboIsAffected(baseSha, headSha),
      log,
      mask,
    });
    summary =
      {
        unaffected:
          'No preview database: the pull request does not change Fresco.',
        unavailable: 'No preview database: the base branch has none to copy.',
        shared: `Preview database \`${result.name}\` left as it is: another open pull request shares its head branch.`,
      }[result.action] ??
      `Preview database \`${result.name}\` (${result.action}), copied from \`${result.parent}\`.`;
  } else if (command === 'teardown') {
    const result = await teardown({
      neon,
      netlify,
      head: pr.head,
      otherPullRequests: await github.otherOpenPullRequests(pr.head, pr.number),
      log,
    });
    summary = result.deleted
      ? `Deleted preview database \`${result.name}\`.`
      : `Preview database \`${result.name}\` was not deleted.`;
  } else {
    throw new Error('usage: fresco-preview-database.mjs sync|teardown');
  }

  // eslint-disable-next-line no-process-env
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  if (summaryFile) appendFileSync(summaryFile, `${summary}\n`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
