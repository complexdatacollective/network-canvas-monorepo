import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FLY_MACHINE_PREPARATION_SERVICE_NAMES,
  prepareFlyMachines,
} from './fly-machine-preparation.mjs';

const TOKEN = 'FlyV1 fm2_fixture-token-private';
const ESTATE = 'networkcanvas-studio';
const ORGANIZATION = 'networkcanvas';
const STUDIO_IMAGE =
  'ghcr.io/complexdatacollective/studio@sha256:' + '1'.repeat(64);
const REGISTRY_IMAGE =
  'ghcr.io/complexdatacollective/template-registry@sha256:' + '2'.repeat(64);

const services = Object.freeze([...FLY_MACHINE_PREPARATION_SERVICE_NAMES]);

function appNames() {
  return Object.fromEntries(
    services.map((service) => [service, `nc-${service}`]),
  );
}

function serviceSpecs() {
  return Object.fromEntries(
    services.map((service) => [
      service,
      {
        name: `${ESTATE}-${service}`,
        region: 'iad',
        image: service.startsWith('studio-') ? STUDIO_IMAGE : REGISTRY_IMAGE,
        count: 1,
        auto_stop: false,
        auto_start: true,
        resources: { cpu_kind: 'shared', cpus: 1, memory_mb: 512 },
        environment: service.startsWith('studio-')
          ? { STUDIO_DEPLOYMENT_MODE: 'managed', STUDIO_ROLE: 'both' }
          : {},
      },
    ]),
  );
}

function desiredConfig(service, spec = serviceSpecs()[service]) {
  return {
    image: spec.image,
    guest: { ...spec.resources },
    env: { ...spec.environment },
    metadata: {
      'network-canvas-estate': ESTATE,
      'network-canvas-service': service,
    },
    restart: { policy: 'always' },
    auto_destroy: false,
    services: [],
    checks: {},
    dns: {},
    files: [],
    init: {},
    mounts: [],
    processes: [],
    statics: [],
  };
}

function machine(service, overrides = {}) {
  const spec = serviceSpecs()[service];
  return {
    id: `machine${services.indexOf(service) + 1}`,
    instance_id: `version${services.indexOf(service) + 1}`,
    name: spec.name,
    region: spec.region,
    state: 'stopped',
    config: desiredConfig(service, spec),
    ...overrides,
  };
}

function json(value, { status = 200, headers = {} } = {}) {
  const body = JSON.stringify(value);
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

class FlyFixture {
  constructor(initial = {}) {
    this.apps = appNames();
    this.machines = new Map(
      services.map((service) => [
        service,
        initial[service] ? [initial[service]] : [],
      ]),
    );
    this.calls = [];
    this.override = null;
    this.nextVersion = 10;
  }

  serviceForApp(appName) {
    return services.find((service) => this.apps[service] === appName);
  }

  transport = async (url, init) => {
    const parsed = new URL(url);
    const call = {
      url,
      path: parsed.pathname,
      search: parsed.search,
      method: init.method,
      redirect: init.redirect,
      headers: { ...init.headers },
      body: init.body === undefined ? undefined : JSON.parse(init.body),
    };
    this.calls.push(call);
    if (this.override) {
      const response = await this.override(call, init);
      if (response) return response;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    const appName = decodeURIComponent(parts[2] ?? '');
    const service = this.serviceForApp(appName);
    if (!service) return json({ error: 'not found' }, { status: 404 });

    if (parts.length === 3 && init.method === 'GET') {
      return json({
        id: `app-${service}`,
        name: appName,
        status: 'deployed',
        organization: { slug: ORGANIZATION, name: 'Network Canvas' },
      });
    }
    if (parts.length === 4 && parts[3] === 'machines' && init.method === 'GET')
      return json(structuredClone(this.machines.get(service)));
    if (
      parts.length === 4 &&
      parts[3] === 'machines' &&
      init.method === 'POST'
    ) {
      const created = {
        id: `machine${services.indexOf(service) + 1}`,
        instance_id: `version${this.nextVersion++}`,
        name: call.body.name,
        region: call.body.region,
        state: 'created',
        config: {
          ...structuredClone(call.body.config),
          env: service.startsWith('registry-') ? null : call.body.config.env,
          init: {
            exec: null,
            entrypoint: null,
            cmd: null,
            tty: false,
          },
        },
      };
      this.machines.set(service, [created]);
      return json(created);
    }

    const machineId = decodeURIComponent(parts[4] ?? '');
    const current = this.machines.get(service)[0];
    if (!current || current.id !== machineId)
      return json({ error: 'not found' }, { status: 404 });
    if (parts[5] === 'wait' && init.method === 'GET') return json({ ok: true });
    if (parts[5] === 'lease' && init.method === 'POST')
      return json(
        { status: 'success', data: { nonce: 'lease123', expires_at: 1 } },
        { status: 201 },
      );
    if (parts[5] === 'lease' && init.method === 'DELETE')
      return json({ status: 'success', data: { ok: true } });
    if (parts.length === 5 && init.method === 'GET')
      return json(structuredClone(current));
    if (parts.length === 5 && init.method === 'POST') {
      const updated = {
        ...current,
        instance_id: `version${this.nextVersion++}`,
        name: call.body.name ?? current.name,
        region: call.body.region ?? current.region,
        state: 'stopped',
        config: structuredClone(call.body.config),
      };
      this.machines.set(service, [updated]);
      return json(updated);
    }
    return json({ error: 'unsupported fixture request' }, { status: 500 });
  };
}

function input(fixture, overrides = {}) {
  return {
    token: TOKEN,
    organizationSlug: ORGANIZATION,
    estateName: ESTATE,
    appNames: fixture.apps,
    serviceSpecs: serviceSpecs(),
    transport: fixture.transport,
    requestTimeoutMs: 500,
    operationTimeoutMs: 3_000,
    maximumResponseBytes: 16_384,
    ...overrides,
  };
}

function mutationCalls(fixture) {
  return fixture.calls.filter((call) => call.method !== 'GET');
}

test('creates four exact digest-pinned nonrunning and unrouted Machines', async () => {
  const fixture = new FlyFixture();
  const result = await prepareFlyMachines(input(fixture));

  assert.equal(result.prepared.length, 4);
  assert.deepEqual(
    result.prepared.map(({ service, action }) => ({ service, action })),
    services.map((service) => ({ service, action: 'created' })),
  );
  assert.equal(result.activationRequired, true);
  assert.equal(result.qualificationComplete, false);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN));

  const creates = fixture.calls.filter(
    (call) => call.method === 'POST' && call.path.endsWith('/machines'),
  );
  assert.equal(creates.length, 4, 'all four non-empty fixture cases mutate');
  for (const call of creates) {
    const service = fixture.serviceForApp(call.path.split('/')[3]);
    assert.ok(service);
    assert.equal(call.redirect, 'error');
    assert.equal(call.headers.authorization, `Bearer ${TOKEN}`);
    assert.equal(call.body.skip_launch, true);
    assert.equal(call.body.skip_service_registration, true);
    assert.deepEqual(call.body.config, desiredConfig(service));
    assert.deepEqual(call.body.config.services, []);
  }
});

test('polls Machine reads through a bounded transition without using the wait API', async () => {
  const fixture = new FlyFixture();
  let firstMachinePolls = 0;
  fixture.override = (call) => {
    if (
      call.method === 'GET' &&
      call.path === '/v1/apps/nc-registry-production/machines/machine1'
    ) {
      firstMachinePolls += 1;
      if (firstMachinePolls === 1)
        return json(
          machine('registry-production', {
            instance_id: 'version10',
            state: 'replacing',
          }),
        );
    }
    return null;
  };
  const result = await prepareFlyMachines(input(fixture));
  assert.equal(result.prepared[0].action, 'created');
  assert.equal(firstMachinePolls, 2);
  assert.equal(
    fixture.calls.some((call) => call.path.endsWith('/wait')),
    false,
  );
});

test('reuses exact created or stopped Machines without a write request', async () => {
  const fixture = new FlyFixture(
    Object.fromEntries(
      services.map((service, index) => [
        service,
        machine(service, { state: index % 2 === 0 ? 'created' : 'stopped' }),
      ]),
    ),
  );
  const result = await prepareFlyMachines(input(fixture));
  assert.ok(result.prepared.every(({ action }) => action === 'reused'));
  assert.equal(mutationCalls(fixture).length, 0);
  assert.ok(
    fixture.calls.length >= 24,
    'preflight, action-time, and final inventory passes ran',
  );
});

test('leases, rechecks and updates only a marked stopped Machine', async () => {
  const initial = Object.fromEntries(
    services.map((service) => [service, machine(service)]),
  );
  initial['registry-production'].config.guest.memory_mb = 256;
  const fixture = new FlyFixture(initial);
  const result = await prepareFlyMachines(input(fixture));
  assert.equal(
    result.prepared.find(({ service }) => service === 'registry-production')
      .action,
    'updated',
  );
  const writes = mutationCalls(fixture);
  assert.deepEqual(
    writes.map(({ method, path }) => ({
      method,
      path: path.split('/').at(-1),
    })),
    [
      { method: 'POST', path: 'lease' },
      { method: 'POST', path: 'machine1' },
      { method: 'DELETE', path: 'lease' },
    ],
  );
  assert.equal(writes[1].body.current_version, 'version1');
  assert.equal(writes[1].body.skip_launch, true);
  assert.equal('name' in writes[1].body, false);
  assert.equal('region' in writes[1].body, false);
  assert.equal(writes[1].headers['fly-machine-lease-nonce'], 'lease123');
});

test('candidate drift and mutable images fail before any API request', async () => {
  const cases = [
    [
      'mutable image',
      (specs) =>
        (specs['studio-production'].image = 'example.test/studio:latest'),
    ],
    ['wrong region', (specs) => (specs['studio-production'].region = 'ord')],
    ['wrong CPU', (specs) => (specs['studio-production'].resources.cpus = 2)],
    [
      'wrong memory',
      (specs) => (specs['studio-production'].resources.memory_mb = 1024),
    ],
    [
      'wrong environment',
      (specs) => (specs['studio-production'].environment.STUDIO_ROLE = 'web'),
    ],
    ['wrong count', (specs) => (specs['studio-production'].count = 2)],
  ];
  assert.ok(cases.length > 0);
  for (const [name, mutate] of cases) {
    const label = String(name);
    const fixture = new FlyFixture();
    const specs = serviceSpecs();
    mutate(specs);
    await assert.rejects(
      prepareFlyMachines(input(fixture, { serviceSpecs: specs })),
      /does not match candidate-sizing\.json|same signed product images/,
      label,
    );
    assert.equal(fixture.calls.length, 0, `${label} reached the API`);
  }
});

test('active, duplicate and foreign Machine identities refuse before mutation', async () => {
  const cases = [
    ['active', [machine('registry-production', { state: 'started' })]],
    [
      'duplicate',
      [
        machine('registry-production'),
        machine('registry-production', { id: 'other' }),
      ],
    ],
    [
      'foreign name',
      [machine('registry-production', { name: 'unmanaged-machine' })],
    ],
    [
      'foreign marker',
      [
        machine('registry-production', {
          config: {
            ...desiredConfig('registry-production'),
            metadata: { 'network-canvas-estate': ESTATE },
          },
        }),
      ],
    ],
  ];
  assert.ok(cases.length > 0);
  for (const [name, machines] of cases) {
    const label = typeof name === 'string' ? name : 'invalid case name';
    const fixture = new FlyFixture();
    fixture.machines.set('registry-production', machines);
    await assert.rejects(prepareFlyMachines(input(fixture)), /Machine/);
    assert.equal(
      mutationCalls(fixture).length,
      0,
      `${label} reached a mutation`,
    );
  }
});

test('wrong-account, unauthorized, malformed and incomplete inventories fail read-only', async () => {
  const cases = [
    [
      'wrong account',
      (call) =>
        call.path === '/v1/apps/nc-registry-production'
          ? json({
              id: 'foreign',
              name: 'nc-registry-production',
              organization: { slug: 'foreign' },
            })
          : null,
    ],
    ['unauthorized', () => json({ error: TOKEN }, { status: 401 })],
    ['redirect', () => json({ location: 'foreign' }, { status: 302 })],
    ['malformed JSON', () => new Response('{', { status: 200 })],
    [
      'oversized',
      () =>
        new Response('{}', {
          status: 200,
          headers: { 'content-length': '20000' },
        }),
    ],
    [
      'streamed oversized',
      () => new Response('x'.repeat(20_000), { status: 200 }),
    ],
    [
      'pagination header',
      () =>
        json([], {
          headers: { link: '<https://example.test/page/2>; rel="next"' },
        }),
    ],
    [
      'pagination-shaped object',
      (call) =>
        call.path.endsWith('/machines')
          ? json({ machines: [], next_page_token: 'more' })
          : null,
    ],
  ];
  assert.ok(cases.length > 0);
  for (const [name, override] of cases) {
    const label = String(name);
    const fixture = new FlyFixture();
    fixture.override = override;
    await assert.rejects(prepareFlyMachines(input(fixture)));
    assert.equal(
      mutationCalls(fixture).length,
      0,
      `${label} reached a mutation`,
    );
  }
});

test('a transport timeout is bounded, read-only and redacts the token', async () => {
  const fixture = new FlyFixture();
  fixture.override = () => new Promise(() => {});
  const started = Date.now();
  await assert.rejects(
    prepareFlyMachines(
      input(fixture, { requestTimeoutMs: 20, operationTimeoutMs: 100 }),
    ),
    (error) => {
      assert.doesNotMatch(error.message, new RegExp(TOKEN));
      assert.match(error.message, /failed or timed out/);
      return true;
    },
  );
  assert.ok(
    Date.now() - started < 500,
    'timeout exceeded its outer test bound',
  );
  assert.equal(mutationCalls(fixture).length, 0);
});

test('a response arriving after timeout has its body cancelled', async () => {
  const fixture = new FlyFixture();
  let cancelled = false;
  let resolveTransport;
  fixture.override = () =>
    new Promise((resolve) => {
      resolveTransport = resolve;
    });
  await assert.rejects(
    prepareFlyMachines(
      input(fixture, { requestTimeoutMs: 20, operationTimeoutMs: 100 }),
    ),
  );
  resolveTransport(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { status: 200 },
    ),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
  assert.equal(mutationCalls(fixture).length, 0);
});

test('a stalled response stream is cancelled within the request bound', async () => {
  const fixture = new FlyFixture();
  let cancelled = false;
  fixture.override = () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{'));
        },
        cancel() {
          cancelled = true;
        },
      }),
      { status: 200 },
    );
  await assert.rejects(
    prepareFlyMachines(
      input(fixture, { requestTimeoutMs: 20, operationTimeoutMs: 100 }),
    ),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cancelled, true);
  assert.equal(mutationCalls(fixture).length, 0);
});

test('transport diagnostics cannot disclose the caller token', async () => {
  const fixture = new FlyFixture();
  fixture.override = () => {
    throw new Error(`provider echoed ${TOKEN}`);
  };
  await assert.rejects(prepareFlyMachines(input(fixture)), (error) => {
    assert.doesNotMatch(error.message, new RegExp(TOKEN));
    return true;
  });
});

test('a Machine becoming active under its lease is refused before update', async () => {
  const initial = Object.fromEntries(
    services.map((service) => [service, machine(service)]),
  );
  initial['registry-production'].config.guest.memory_mb = 256;
  const fixture = new FlyFixture(initial);
  fixture.override = (call) => {
    if (call.method === 'GET' && call.path.endsWith('/machines/machine1'))
      return json(machine('registry-production', { state: 'started' }));
    return null;
  };
  await assert.rejects(prepareFlyMachines(input(fixture)), /not nonrunning/);
  const writes = mutationCalls(fixture);
  assert.deepEqual(
    writes.map(({ method, path }) => ({
      method,
      path: path.split('/').at(-1),
    })),
    [
      { method: 'POST', path: 'lease' },
      { method: 'DELETE', path: 'lease' },
    ],
  );
});

test('a volume attached or unknown config added before the lease is preserved', async () => {
  const changes = [
    ['mounts', [{ volume: 'vol_added_concurrently', path: '/data' }]],
    ['unreviewed_provider_option', { enabled: true }],
  ];
  assert.equal(changes.length, 2);
  for (const [field, value] of changes) {
    const initial = Object.fromEntries(
      services.map((service) => [service, machine(service)]),
    );
    initial['registry-production'].config.guest.memory_mb = 256;
    const fixture = new FlyFixture(initial);
    let changed = false;
    fixture.override = (call) => {
      if (call.method === 'POST' && call.path.endsWith('/lease')) {
        fixture.machines.get('registry-production')[0].config[field] = value;
        changed = true;
      }
      return null;
    };
    await assert.rejects(
      prepareFlyMachines(input(fixture)),
      /attached volume|unsupported field/,
    );
    assert.equal(
      changed,
      true,
      'the concurrent change occurred before the leased read',
    );
    assert.deepEqual(
      fixture.machines.get('registry-production')[0].config[field],
      value,
      'preparation must preserve the unreviewed config',
    );
    assert.deepEqual(
      mutationCalls(fixture).map(({ method, path }) => [
        method,
        path.split('/').at(-1),
      ]),
      [
        ['POST', 'lease'],
        ['DELETE', 'lease'],
      ],
      'the lease is released without updating the Machine',
    );
  }
});

test('executable or nonempty provider config is corrected, while volumes refuse before mutation', async () => {
  const unsafeConfigs = [
    ['init', { exec: ['/bin/sh', '-c', 'unreviewed'] }],
    ['services', { ports: [443] }],
    ['files', [{ guest_path: '/secret', raw_value: 'unsafe' }]],
    ['processes', [{ name: 'foreign', cmd: ['sleep', 'infinity'] }]],
    ['auto_destroy', true],
    ['schedule', 'hourly'],
  ];
  for (const [field, value] of unsafeConfigs) {
    if (typeof field !== 'string') throw new TypeError('invalid test case');
    const fieldName = field;
    const correctable = Object.fromEntries(
      services.map((service) => [service, machine(service)]),
    );
    correctable['registry-production'].config[field] = value;
    const fixture = new FlyFixture(correctable);
    const result = await prepareFlyMachines(input(fixture));
    assert.equal(
      result.prepared.find(({ service }) => service === 'registry-production')
        .action,
      'updated',
      `${fieldName} drift was silently reused`,
    );
    const update = mutationCalls(fixture).find(
      (call) => call.method === 'POST' && call.path.endsWith('/machine1'),
    );
    assert.ok(update, `${fieldName} drift was not corrected`);
    assert.deepEqual(update.body.config.init, {});
    assert.deepEqual(update.body.config.services, []);
    assert.deepEqual(update.body.config.files, []);
    assert.deepEqual(update.body.config.processes, []);
    assert.equal(update.body.config.auto_destroy, false);
    assert.equal('schedule' in update.body.config, false);
  }

  const withVolume = Object.fromEntries(
    services.map((service) => [service, machine(service)]),
  );
  withVolume['registry-production'].config.mounts = [
    { volume: 'vol_foreign', path: '/data' },
  ];
  const volumeFixture = new FlyFixture(withVolume);
  await assert.rejects(
    prepareFlyMachines(input(volumeFixture)),
    /attached volume/,
  );
  assert.equal(mutationCalls(volumeFixture).length, 0);
});

test('snapshots caller-owned app and service inputs before the first await', async () => {
  const fixture = new FlyFixture(
    Object.fromEntries(services.map((service) => [service, machine(service)])),
  );
  const names = { ...fixture.apps };
  const specs = serviceSpecs();
  let mutated = false;
  fixture.override = () => {
    if (!mutated) {
      mutated = true;
      names['registry-production'] = 'foreign-app';
      specs['registry-production'].image =
        'example.test/foreign@sha256:' + '9'.repeat(64);
      specs['registry-production'].resources.memory_mb = 32_768;
    }
    return null;
  };
  const result = await prepareFlyMachines(
    input(fixture, { appNames: names, serviceSpecs: specs }),
  );
  const registry = result.prepared.find(
    ({ service }) => service === 'registry-production',
  );
  assert.equal(registry.appName, 'nc-registry-production');
  assert.equal(registry.image, REGISTRY_IMAGE);
  assert.equal(
    fixture.calls.some((call) => call.path.includes('foreign-app')),
    false,
  );
});

test('final inventory is bound to the prepared Machine id', async () => {
  const fixture = new FlyFixture(
    Object.fromEntries(services.map((service) => [service, machine(service)])),
  );
  let registryLists = 0;
  fixture.override = (call) => {
    if (
      call.method === 'GET' &&
      call.path === '/v1/apps/nc-registry-production/machines'
    ) {
      registryLists += 1;
      if (registryLists === 3)
        return json([
          machine('registry-production', {
            id: 'substitute',
            instance_id: 'substituteversion',
          }),
        ]);
    }
    return null;
  };
  await assert.rejects(
    prepareFlyMachines(input(fixture)),
    /did not remain the exact nonrunning prepared Machine/,
  );
  assert.equal(mutationCalls(fixture).length, 0);
});

test('an identity appearing after preflight refuses before mutation', async () => {
  const fixture = new FlyFixture();
  let registryLists = 0;
  fixture.override = (call) => {
    if (
      call.method === 'GET' &&
      call.path === '/v1/apps/nc-registry-production/machines'
    ) {
      registryLists += 1;
      if (registryLists === 2) return json([machine('registry-production')]);
    }
    return null;
  };
  await assert.rejects(
    prepareFlyMachines(input(fixture)),
    /Machine inventory changed before preparation/,
  );
  assert.equal(mutationCalls(fixture).length, 0);
});

test('rejects header control characters while accepting documented FlyV1 token syntax', async () => {
  const fixture = new FlyFixture(
    Object.fromEntries(services.map((service) => [service, machine(service)])),
  );
  await prepareFlyMachines(input(fixture));
  assert.equal(fixture.calls[0].headers.authorization, `Bearer ${TOKEN}`);

  const invalid = new FlyFixture();
  await assert.rejects(
    prepareFlyMachines(input(invalid, { token: 'FlyV1 fm2_bad\r\nheader' })),
    /caller token is invalid/,
  );
  assert.equal(invalid.calls.length, 0);
});

test('expiry during lifecycle polling does not start an already-aborted request', async () => {
  const fixture = new FlyFixture();
  let polled = false;
  let afterExpiry = false;
  fixture.override = (call, init) => {
    if (init.signal.aborted) {
      afterExpiry = true;
      return Promise.reject(new Error('transport was invoked after expiry'));
    }
    if (call.method === 'GET' && /\/machines\/machine[0-9]+$/.test(call.path)) {
      polled = true;
      return json({ state: 'creating' });
    }
    return null;
  };
  await assert.rejects(
    prepareFlyMachines(input(fixture, { operationTimeoutMs: 50 })),
    /failed or timed out/,
  );
  assert.equal(polled, true, 'the operation expired between lifecycle polls');
  assert.equal(
    afterExpiry,
    false,
    'no transport request may begin after the operation expires',
  );
});
