import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  createNeon,
  createNetlify,
  planProvision,
  planTeardown,
  provision,
  teardown,
} from './fresco-preview-database.mjs';

const production = { id: 'br-main', name: 'production', default: true };
const schema9 = { id: 'br-s9', name: 'preview/schema-9', parent_id: 'br-main' };

test('a pull request into main copies the default branch', () => {
  const plan = planProvision({
    branches: [production],
    head: 'feature',
    base: 'main',
  });
  assert.equal(plan.action, 'create');
  assert.equal(plan.name, 'preview/feature');
  assert.equal(plan.parent, production);
});

test("a pull request into another branch copies that branch's preview", () => {
  const plan = planProvision({
    branches: [production, schema9],
    head: 'feature',
    base: 'schema-9',
  });
  assert.equal(plan.action, 'create');
  assert.equal(plan.parent, schema9);
});

test('a base with no preview database leaves the pull request without one', () => {
  const plan = planProvision({
    branches: [production],
    head: 'feature',
    base: 'hotfix/fresco-4.2.1',
  });
  assert.equal(plan.action, 'unavailable');
  assert.match(plan.reason, /hotfix\/fresco-4\.2\.1 has no preview database/);
});

test('an existing preview copied from the same base is kept', () => {
  const existing = { id: 'br-f', name: 'preview/feature', parent_id: 'br-s9' };
  const plan = planProvision({
    branches: [production, schema9, existing],
    head: 'feature',
    base: 'schema-9',
  });
  assert.equal(plan.action, 'keep');
  assert.equal(plan.existing, existing);
});

test('a retargeted pull request replaces its preview', () => {
  const existing = {
    id: 'br-f',
    name: 'preview/feature',
    parent_id: 'br-main',
  };
  const plan = planProvision({
    branches: [production, schema9, existing],
    head: 'feature',
    base: 'schema-9',
  });
  assert.equal(plan.action, 'recreate');
});

test('a preview other previews copy cannot be replaced', () => {
  const existing = {
    id: 'br-f',
    name: 'preview/feature',
    parent_id: 'br-main',
  };
  const child = { id: 'br-c', name: 'preview/child', parent_id: 'br-f' };
  assert.throws(
    () =>
      planProvision({
        branches: [production, schema9, existing, child],
        head: 'feature',
        base: 'schema-9',
      }),
    /preview\/child is copied from it/,
  );
});

test('main never gets a preview database', () => {
  assert.throws(
    () => planProvision({ branches: [production], head: 'main', base: 'x' }),
    /never gets a preview database/,
  );
});

test('teardown reports previews still copied from the one being removed', () => {
  const child = { id: 'br-c', name: 'preview/child', parent_id: 'br-s9' };
  const plan = planTeardown({
    branches: [production, schema9, child],
    head: 'schema-9',
  });
  assert.equal(plan.branch, schema9);
  assert.deepEqual(plan.children, [child]);
});

/**
 * A fake of the slice of the Neon and Netlify APIs the script uses, recording
 * every request so a test can assert what was sent and in what order.
 */
function fakeApis({ branches, env = {} }) {
  const calls = [];
  const state = { branches: [...branches], env: structuredClone(env) };
  let nextId = 0;

  const respond = (status, body) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status });

  async function fetchImpl(url, { method = 'GET', body } = {}) {
    const { pathname, searchParams } = new URL(url);
    const payload = body ? JSON.parse(body) : undefined;
    calls.push({ method, pathname, payload });

    if (pathname === '/api/v2/projects/p/branches' && method === 'GET') {
      return respond(200, { branches: state.branches });
    }
    if (pathname === '/api/v2/projects/p/branches' && method === 'POST') {
      const branch = {
        id: `br-new-${(nextId += 1)}`,
        name: payload.branch.name,
        parent_id: payload.branch.parent_id,
      };
      state.branches.push(branch);
      return respond(201, { branch, operations: [{ id: 'op-create' }] });
    }
    const branchMatch = pathname.match(
      /^\/api\/v2\/projects\/p\/branches\/([^/]+)$/,
    );
    if (branchMatch && method === 'DELETE') {
      state.branches = state.branches.filter((b) => b.id !== branchMatch[1]);
      return respond(200, { operations: [{ id: 'op-delete' }] });
    }
    if (pathname.startsWith('/api/v2/projects/p/operations/')) {
      return respond(200, { operation: { action: 'x', status: 'finished' } });
    }
    if (pathname.endsWith('/databases')) {
      return respond(200, {
        databases: [{ name: 'neondb', owner_name: 'neondb_owner' }],
      });
    }
    if (pathname === '/api/v2/projects/p/connection_uri') {
      const pooled = searchParams.get('pooled') === 'true';
      return respond(200, {
        uri: `postgres://${searchParams.get('branch_id')}${pooled ? '-pooler' : ''}`,
      });
    }
    if (pathname === '/api/v1/sites/site') {
      return respond(200, { account_id: 'acct' });
    }
    const envMatch = pathname.match(
      /^\/api\/v1\/accounts\/acct\/env(?:\/([^/]+))?(?:\/value\/([^/]+))?$/,
    );
    if (envMatch) {
      const [, key, valueId] = envMatch;
      if (method === 'GET') {
        return state.env[key] ? respond(200, state.env[key]) : respond(404);
      }
      if (method === 'POST') {
        for (const variable of payload) {
          state.env[variable.key] = {
            key: variable.key,
            is_secret: variable.is_secret,
            values: variable.values.map((v, i) => ({ id: `v${i}`, ...v })),
          };
        }
        return respond(201, payload);
      }
      if (method === 'PATCH') {
        const variable = state.env[key];
        variable.values = variable.values.filter(
          (v) =>
            !(
              v.context === payload.context &&
              v.context_parameter === payload.context_parameter
            ),
        );
        variable.values.push({ id: `v${(nextId += 1)}`, ...payload });
        return respond(200, payload);
      }
      if (method === 'DELETE') {
        state.env[key].values = state.env[key].values.filter(
          (v) => v.id !== valueId,
        );
        return respond(204);
      }
    }
    if (pathname === '/api/v1/sites/site/builds' && method === 'POST') {
      return respond(200, { deploy_id: 'd1' });
    }
    throw new Error(`unexpected ${method} ${pathname}`);
  }

  return {
    calls,
    state,
    neon: createNeon({
      apiKey: 'k',
      projectId: 'p',
      fetchImpl,
      sleep: async () => {},
    }),
    netlify: createNetlify({ token: 't', siteId: 'site', fetchImpl }),
  };
}

const productionOnlyEnv = {
  DATABASE_URL: {
    key: 'DATABASE_URL',
    is_secret: true,
    values: [{ id: 'prod', context: 'production', value: 'postgres://prod' }],
  },
  DATABASE_URL_UNPOOLED: {
    key: 'DATABASE_URL_UNPOOLED',
    is_secret: true,
    values: [{ id: 'produ', context: 'production', value: 'postgres://prod' }],
  },
};

const branchValue = (state, key, gitBranch) =>
  state.env[key]?.values.find(
    (v) => v.context === 'branch' && v.context_parameter === gitBranch,
  )?.value;

test('provisioning a new preview copies the base, scopes its values to the branch, and builds', async () => {
  const apis = fakeApis({
    branches: [production, schema9],
    env: productionOnlyEnv,
  });
  const masked = [];

  const result = await provision({
    ...apis,
    head: 'feature',
    base: 'schema-9',
    log: () => {},
    mask: (secret) => masked.push(secret),
  });

  assert.deepEqual(result, {
    action: 'create',
    name: 'preview/feature',
    parent: 'preview/schema-9',
    build: true,
  });
  const created = apis.calls.find(
    (call) => call.method === 'POST' && call.pathname.endsWith('/branches'),
  );
  assert.deepEqual(created.payload.branch, {
    name: 'preview/feature',
    parent_id: 'br-s9',
  });

  const branchId = apis.state.branches.at(-1).id;
  assert.equal(
    branchValue(apis.state, 'DATABASE_URL', 'feature'),
    `postgres://${branchId}-pooler`,
  );
  assert.equal(
    branchValue(apis.state, 'DATABASE_URL_UNPOOLED', 'feature'),
    `postgres://${branchId}`,
  );
  assert.equal(
    branchValue(apis.state, 'PREVIEW_DATABASE_BRANCH', 'feature'),
    'preview/feature',
  );
  // Production's own values are untouched.
  assert.deepEqual(
    apis.state.env.DATABASE_URL.values.find((v) => v.id === 'prod'),
    productionOnlyEnv.DATABASE_URL.values[0],
  );
  assert.deepEqual(masked, [
    `postgres://${branchId}-pooler`,
    `postgres://${branchId}`,
  ]);
  assert.ok(
    apis.calls.some(
      (call) =>
        call.pathname === '/api/v1/sites/site/builds' &&
        call.payload.branch === 'feature',
    ),
  );
});

test('a push to a provisioned preview leaves its database alone and lets Netlify build', async () => {
  const existing = {
    id: 'br-f',
    name: 'preview/feature',
    parent_id: 'br-main',
  };
  const apis = fakeApis({
    branches: [production, existing],
    env: productionOnlyEnv,
  });
  await provision({
    ...apis,
    head: 'feature',
    base: 'main',
    log: () => {},
    mask: () => {},
  });
  apis.calls.length = 0;

  const result = await provision({
    ...apis,
    head: 'feature',
    base: 'main',
    log: () => {},
    mask: () => {},
  });

  assert.equal(result.action, 'keep');
  assert.equal(result.build, false);
  assert.ok(
    !apis.calls.some(
      (call) =>
        (call.method === 'POST' || call.method === 'DELETE') &&
        call.pathname.startsWith('/api/v2/'),
    ),
    'no Neon branch is created or deleted',
  );
  assert.ok(
    !apis.calls.some((call) => call.pathname.endsWith('/builds')),
    'no extra build is triggered',
  );
});

test('a pull request into a base with no preview provisions nothing', async () => {
  const apis = fakeApis({ branches: [production], env: productionOnlyEnv });
  const lines = [];
  const result = await provision({
    ...apis,
    head: 'feature',
    base: 'hotfix/x',
    log: (line) => lines.push(line),
    mask: () => {},
  });
  assert.equal(result.action, 'unavailable');
  assert.match(lines.join('\n'), /^::warning::/m);
  assert.ok(
    apis.calls.every((call) => call.method === 'GET'),
    'nothing is written',
  );
});

test('teardown removes the branch values before the database', async () => {
  const apis = fakeApis({
    branches: [production, schema9],
    env: productionOnlyEnv,
  });
  await provision({
    ...apis,
    head: 'feature',
    base: 'main',
    log: () => {},
    mask: () => {},
  });
  apis.calls.length = 0;

  const result = await teardown({
    ...apis,
    head: 'feature',
    log: () => {},
  });

  assert.equal(result.deleted, true);
  for (const key of [
    'DATABASE_URL',
    'DATABASE_URL_UNPOOLED',
    'PREVIEW_DATABASE_BRANCH',
  ]) {
    assert.equal(branchValue(apis.state, key, 'feature'), undefined, key);
  }
  assert.equal(apis.state.env.DATABASE_URL.values.length, 1, 'production kept');
  assert.ok(!apis.state.branches.some((b) => b.name === 'preview/feature'));

  const lastValueDelete = apis.calls.findLastIndex((call) =>
    call.pathname.includes('/value/'),
  );
  const branchDelete = apis.calls.findIndex(
    (call) => call.method === 'DELETE' && call.pathname.includes('/branches/'),
  );
  assert.ok(lastValueDelete < branchDelete);
});

test('teardown keeps a preview that other previews copy', async () => {
  const child = { id: 'br-c', name: 'preview/child', parent_id: 'br-s9' };
  const apis = fakeApis({
    branches: [production, schema9, child],
    env: productionOnlyEnv,
  });
  const lines = [];
  const result = await teardown({
    ...apis,
    head: 'schema-9',
    log: (line) => lines.push(line),
  });
  assert.equal(result.deleted, false);
  assert.ok(apis.state.branches.includes(schema9));
  assert.match(lines.join('\n'), /::warning::Keeping preview\/schema-9/);
});
