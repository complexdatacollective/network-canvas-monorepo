import { readFile } from 'node:fs/promises';

const candidate = JSON.parse(
  await readFile(new URL('./candidate-sizing.json', import.meta.url), 'utf8'),
);

const SERVICE_NAMES = Object.freeze(Object.keys(candidate.services).toSorted());
const API_BASE_URL = 'https://api.machines.dev';
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_OPERATION_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 128 * 1024;
const MAX_MACHINES_PER_APP = 8;
const LEASE_TTL_SECONDS = 15;
const MACHINE_POLL_ATTEMPTS = 5;
const MACHINE_POLL_INTERVAL_MS = 100;
const IDENTIFIER = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const MACHINE_ID = /^[a-z0-9]{1,64}$/;
const MACHINE_VERSION = /^[A-Za-z0-9]{1,64}$/;
const IMMUTABLE_IMAGE = /^[^\s@]+@sha256:[0-9a-f]{64}$/;

function fail(message) {
  throw new Error(`Fly Machine preparation: ${message}`);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return (
    record(value) &&
    Object.keys(value).toSorted().join('\n') === expected.toSorted().join('\n')
  );
}

function boundedInteger(value, name, maximum) {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum)
    fail(`${name} is invalid`);
  return value;
}

function validateToken(token) {
  let hasControlCharacter = false;
  if (typeof token === 'string') {
    for (let index = 0; index < token.length; index += 1) {
      const code = token.charCodeAt(index);
      if (code < 32 || code === 127) {
        hasControlCharacter = true;
        break;
      }
    }
  }
  if (
    typeof token !== 'string' ||
    token.length < 8 ||
    token.length > 4_096 ||
    hasControlCharacter ||
    token.trim() !== token
  )
    fail('the caller token is invalid');
}

function validateIdentifier(value, name) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value))
    fail(`${name} is invalid`);
  return value;
}

function expectedEnvironment(service) {
  return service.startsWith('studio-')
    ? { STUDIO_DEPLOYMENT_MODE: 'managed', STUDIO_ROLE: 'both' }
    : {};
}

function validateServiceSpecs(estateName, serviceSpecs) {
  if (!exactKeys(serviceSpecs, SERVICE_NAMES))
    fail('service requirements do not name the four candidate services');

  for (const service of SERVICE_NAMES) {
    const spec = serviceSpecs[service];
    const resources = candidate.services[service];
    const environment = expectedEnvironment(service);
    if (
      !exactKeys(spec, [
        'auto_start',
        'auto_stop',
        'count',
        'environment',
        'image',
        'name',
        'region',
        'resources',
      ]) ||
      spec.name !== `${estateName}-${service}` ||
      spec.region !== candidate.region ||
      spec.count !== 1 ||
      spec.auto_stop !== false ||
      spec.auto_start !== true ||
      !IMMUTABLE_IMAGE.test(spec.image) ||
      !exactKeys(spec.resources, ['cpu_kind', 'cpus', 'memory_mb']) ||
      spec.resources.cpu_kind !== resources.cpu_kind ||
      spec.resources.cpus !== resources.cpus ||
      spec.resources.memory_mb !== resources.memory_mb ||
      !exactKeys(spec.environment, Object.keys(environment)) ||
      Object.entries(environment).some(
        ([key, value]) => spec.environment[key] !== value,
      )
    )
      fail(`${service} does not match candidate-sizing.json`);
  }

  if (
    serviceSpecs['studio-production'].image !==
      serviceSpecs['studio-staging'].image ||
    serviceSpecs['registry-production'].image !==
      serviceSpecs['registry-staging'].image
  )
    fail('production and staging must use the same signed product images');
}

function validateAppNames(appNames) {
  if (!exactKeys(appNames, SERVICE_NAMES))
    fail('app inventory does not name the four candidate services');
  const values = SERVICE_NAMES.map((service) =>
    validateIdentifier(appNames[service], `${service} app name`),
  );
  if (new Set(values).size !== values.length)
    fail('each candidate service requires a distinct Fly app');
}

function combinedSignal(operationSignal, requestTimeoutMs) {
  return AbortSignal.any([
    operationSignal,
    AbortSignal.timeout(requestTimeoutMs),
  ]);
}

function abortRace(promise, signal, onLateResolve = () => {}) {
  if (signal.aborted) {
    Promise.resolve(promise).then(onLateResolve, () => {});
    return Promise.reject(new Error('aborted'));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const abort = () => {
      settled = true;
      reject(new Error('aborted'));
    };
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', abort);
        if (settled) return onLateResolve(value);
        settled = true;
        return resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        if (settled) return;
        settled = true;
        return reject(error);
      },
    );
  });
}

function cancelBody(reader) {
  if (!reader) return;
  try {
    Promise.resolve(reader.cancel()).catch(() => {});
  } catch {}
}

function cancelResponseBody(response) {
  try {
    cancelBody(response?.body?.getReader?.());
  } catch {}
}

async function boundedJson(response, signal, maximum) {
  const declared = Number(response.headers?.get?.('content-length'));
  const reader = response.body?.getReader?.();
  if (
    response.headers?.get?.('link') ||
    response.headers?.get?.('x-next-page-token') ||
    response.headers?.get?.('x-next-page')
  ) {
    cancelBody(reader);
    fail('paginated API response is unsupported');
  }
  if (Number.isFinite(declared) && declared > maximum) {
    cancelBody(reader);
    fail('API response exceeded its size bound');
  }
  if (!reader) fail('API response body is unavailable');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const part = await abortRace(reader.read(), signal);
      if (!record(part) || typeof part.done !== 'boolean')
        fail('API response stream is malformed');
      if (part.done) break;
      if (!(part.value instanceof Uint8Array))
        fail('API response stream is malformed');
      length += part.value.byteLength;
      if (length > maximum) fail('API response exceeded its size bound');
      chunks.push(Buffer.from(part.value));
    }
  } catch (error) {
    cancelBody(reader);
    throw error;
  }
  try {
    return JSON.parse(Buffer.concat(chunks, length).toString('utf8'));
  } catch {
    return fail('API response is not valid JSON');
  }
}

async function defaultTransport(url, init) {
  return fetch(url, init);
}

function createClient({
  token,
  transport,
  operationSignal,
  requestTimeoutMs,
  maximumResponseBytes,
}) {
  return async function request(
    path,
    { method = 'GET', body, headers = {} } = {},
  ) {
    const signal = combinedSignal(operationSignal, requestTimeoutMs);
    if (signal.aborted) fail('API request failed or timed out');
    let response;
    try {
      response = await abortRace(
        transport(`${API_BASE_URL}${path}`, {
          method,
          redirect: 'error',
          signal,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${token}`,
            ...(body === undefined
              ? {}
              : { 'content-type': 'application/json' }),
            ...headers,
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        }),
        signal,
        cancelResponseBody,
      );
    } catch {
      fail('API request failed or timed out');
    }
    if (
      !record(response) ||
      !Number.isInteger(response.status) ||
      response.status < 100 ||
      response.status > 599
    ) {
      cancelResponseBody(response);
      fail('API response is malformed');
    }
    if (response.status < 200 || response.status >= 300) {
      cancelResponseBody(response);
      fail(`API request was refused with HTTP ${response.status}`);
    }
    return boundedJson(response, signal, maximumResponseBytes);
  };
}

function appPath(appName, suffix = '') {
  return `/v1/apps/${encodeURIComponent(appName)}${suffix}`;
}

function validateApp(value, appName, organizationSlug) {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > 128 ||
    value.name !== appName ||
    !record(value.organization) ||
    value.organization.slug !== organizationSlug
  )
    fail('app inventory does not match the requested organization and app');
}

function machineMetadata(estateName, service) {
  return {
    'network-canvas-estate': estateName,
    'network-canvas-service': service,
  };
}

function desiredConfig(estateName, service, spec) {
  return {
    image: spec.image,
    guest: { ...spec.resources },
    env: { ...spec.environment },
    metadata: machineMetadata(estateName, service),
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

function matchingMetadata(machine, estateName, service) {
  const metadata = machine.config?.metadata;
  const expected = machineMetadata(estateName, service);
  return (
    record(metadata) &&
    Object.entries(expected).every(([key, value]) => metadata[key] === value)
  );
}

function validateMachineIdentity(machine, estateName, service, spec) {
  if (
    !record(machine) ||
    typeof machine.id !== 'string' ||
    !MACHINE_ID.test(machine.id) ||
    machine.name !== spec.name ||
    !matchingMetadata(machine, estateName, service)
  )
    fail(`${service} app contains a foreign Machine identity`);
  if (machine.region !== spec.region)
    fail(`${service} Machine is in the wrong immutable region`);
  if (machine.state !== 'created' && machine.state !== 'stopped')
    fail(`${service} Machine is not nonrunning`);
  if (
    typeof machine.instance_id !== 'string' ||
    !MACHINE_VERSION.test(machine.instance_id)
  )
    fail(`${service} Machine version is invalid`);
  return machine;
}

function sameObject(actual, expected) {
  return (
    exactKeys(actual, Object.keys(expected)) &&
    Object.entries(expected).every(([key, value]) => actual[key] === value)
  );
}

const MACHINE_CONFIG_KEYS = new Set([
  'auto_destroy',
  'checks',
  'dns',
  'env',
  'files',
  'guest',
  'image',
  'init',
  'metadata',
  'metrics',
  'mounts',
  'processes',
  'restart',
  'schedule',
  'services',
  'statics',
  'stop_config',
]);

function emptyArrayOrMissing(value) {
  return (
    value === undefined ||
    value === null ||
    (Array.isArray(value) && value.length === 0)
  );
}

function emptyRecordOrMissing(value) {
  return (
    value === undefined ||
    value === null ||
    (record(value) && Object.keys(value).length === 0)
  );
}

function safeProviderInit(value) {
  if (emptyRecordOrMissing(value)) return true;
  if (!record(value)) return false;
  const allowed = new Set([
    'cmd',
    'entrypoint',
    'exec',
    'kernel_args',
    'swap_size_mb',
    'tty',
  ]);
  return Object.entries(value).every(([key, part]) => {
    if (!allowed.has(key)) return false;
    if (key === 'tty') return part === false || part === null;
    if (key === 'swap_size_mb') return part === null || part === 0;
    return part === null || (Array.isArray(part) && part.length === 0);
  });
}

function environmentMatches(actual, expected) {
  return Object.keys(expected).length === 0 && actual === null
    ? true
    : sameObject(actual, expected);
}

function validateCorrectableConfig(machine, service) {
  const config = machine.config;
  if (!record(config)) fail(`${service} Machine config is malformed`);
  if (Object.keys(config).some((key) => !MACHINE_CONFIG_KEYS.has(key)))
    fail(`${service} Machine config contains an unsupported field`);
  if (!emptyArrayOrMissing(config.mounts))
    fail(`${service} Machine has an attached volume and cannot be prepared`);
}

function configMatches(machine, estateName, service, spec) {
  const config = machine.config;
  const desired = desiredConfig(estateName, service, spec);
  return (
    record(config) &&
    Object.keys(config).every((key) => MACHINE_CONFIG_KEYS.has(key)) &&
    config.image === desired.image &&
    sameObject(config.guest, desired.guest) &&
    environmentMatches(config.env, desired.env) &&
    matchingMetadata(machine, estateName, service) &&
    sameObject(config.restart, desired.restart) &&
    (config.auto_destroy === undefined || config.auto_destroy === false) &&
    emptyArrayOrMissing(config.services) &&
    emptyRecordOrMissing(config.checks) &&
    emptyRecordOrMissing(config.dns) &&
    emptyArrayOrMissing(config.files) &&
    safeProviderInit(config.init) &&
    emptyArrayOrMissing(config.mounts) &&
    emptyArrayOrMissing(config.processes) &&
    emptyArrayOrMissing(config.statics) &&
    emptyRecordOrMissing(config.metrics) &&
    (config.schedule === undefined || config.schedule === null) &&
    emptyRecordOrMissing(config.stop_config)
  );
}

function validateMachineList(value, estateName, service, spec) {
  if (!Array.isArray(value) || value.length > MAX_MACHINES_PER_APP)
    fail(`${service} Machine inventory is malformed or incomplete`);
  if (value.length > 1)
    fail(`${service} app has duplicate or foreign Machines`);
  if (value.length === 0) return null;
  const machine = validateMachineIdentity(value[0], estateName, service, spec);
  validateCorrectableConfig(machine, service);
  return machine;
}

async function inventoryService(request, input, service) {
  const appName = input.appNames[service];
  const spec = input.serviceSpecs[service];
  const app = await request(appPath(appName));
  validateApp(app, appName, input.organizationSlug);
  const machines = await request(appPath(appName, '/machines'));
  return validateMachineList(machines, input.estateName, service, spec);
}

function validateMutationMachine(value, estateName, service, spec) {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !MACHINE_ID.test(value.id) ||
    value.name !== spec.name ||
    value.region !== spec.region ||
    typeof value.instance_id !== 'string' ||
    !MACHINE_VERSION.test(value.instance_id) ||
    !matchingMetadata(value, estateName, service)
  )
    fail(`${service} mutation returned the wrong Machine identity`);
  return value;
}

async function pollNonrunningMachine(
  request,
  machinePath,
  input,
  service,
  headers = {},
) {
  const spec = input.serviceSpecs[service];
  for (let attempt = 0; attempt < MACHINE_POLL_ATTEMPTS; attempt += 1) {
    const value = await request(machinePath, { headers });
    if (value?.state === 'created' || value?.state === 'stopped') {
      const prepared = validateMachineIdentity(
        value,
        input.estateName,
        service,
        spec,
      );
      validateCorrectableConfig(prepared, service);
      if (!configMatches(prepared, input.estateName, service, spec))
        fail(`${service} Machine does not match the prepared config`);
      return prepared;
    }
    if (attempt + 1 < MACHINE_POLL_ATTEMPTS)
      await new Promise((resolve) =>
        setTimeout(resolve, MACHINE_POLL_INTERVAL_MS),
      );
  }
  return fail(`${service} Machine did not reach a nonrunning state`);
}

async function createMachine(request, input, service) {
  const spec = input.serviceSpecs[service];
  const appName = input.appNames[service];
  const created = await request(appPath(appName, '/machines'), {
    method: 'POST',
    body: {
      name: spec.name,
      region: spec.region,
      skip_launch: true,
      skip_service_registration: true,
      config: desiredConfig(input.estateName, service, spec),
    },
  });
  const mutation = validateMutationMachine(
    created,
    input.estateName,
    service,
    spec,
  );
  if (!configMatches(mutation, input.estateName, service, spec))
    fail(`${service} created Machine does not match the prepared config`);
  return pollNonrunningMachine(
    request,
    appPath(appName, `/machines/${encodeURIComponent(mutation.id)}`),
    input,
    service,
  );
}

function validateLease(value) {
  const nonce = value?.data?.nonce;
  if (
    value?.status !== 'success' ||
    typeof nonce !== 'string' ||
    !MACHINE_ID.test(nonce)
  )
    fail('Machine lease response is malformed');
  return nonce;
}

async function updateMachine(request, input, service, inventoried) {
  const spec = input.serviceSpecs[service];
  const appName = input.appNames[service];
  const machinePath = appPath(
    appName,
    `/machines/${encodeURIComponent(inventoried.id)}`,
  );
  const lease = await request(`${machinePath}/lease`, {
    method: 'POST',
    body: {
      description: 'Network Canvas stopped-machine preparation',
      ttl: LEASE_TTL_SECONDS,
    },
  });
  const nonce = validateLease(lease);
  try {
    const fresh = validateMachineIdentity(
      await request(machinePath, {
        headers: { 'fly-machine-lease-nonce': nonce },
      }),
      input.estateName,
      service,
      spec,
    );
    // Inventory precedes the lease. Another operator may have attached a
    // volume or added an unsupported setting before we obtained this lock.
    validateCorrectableConfig(fresh, service);
    const updated = await request(machinePath, {
      method: 'POST',
      headers: { 'fly-machine-lease-nonce': nonce },
      body: {
        current_version: fresh.instance_id,
        skip_launch: true,
        skip_service_registration: true,
        config: desiredConfig(input.estateName, service, spec),
      },
    });
    const mutation = validateMutationMachine(
      updated,
      input.estateName,
      service,
      spec,
    );
    if (mutation.id !== inventoried.id)
      fail(`${service} update returned a substituted Machine identity`);
    if (!configMatches(mutation, input.estateName, service, spec))
      fail(`${service} updated Machine does not match the prepared config`);
    return await pollNonrunningMachine(request, machinePath, input, service, {
      'fly-machine-lease-nonce': nonce,
    });
  } finally {
    await request(`${machinePath}/lease`, {
      method: 'DELETE',
      headers: { 'fly-machine-lease-nonce': nonce },
    });
  }
}

/**
 * Prepare four nonrunning, unrouted Fly Machines. This does not create apps,
 * inject secrets, allocate public addresses, start Machines, or qualify a
 * deployment. The caller supplies an organization-scoped token directly; it
 * is used only in request headers and never returned or persisted.
 */
export async function prepareFlyMachines({
  token,
  organizationSlug,
  estateName,
  appNames,
  serviceSpecs,
  transport = defaultTransport,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  operationTimeoutMs = DEFAULT_OPERATION_TIMEOUT_MS,
  maximumResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
}) {
  validateToken(token);
  validateIdentifier(organizationSlug, 'organization slug');
  validateIdentifier(estateName, 'estate name');
  validateAppNames(appNames);
  validateServiceSpecs(estateName, serviceSpecs);
  if (typeof transport !== 'function') fail('transport is invalid');
  boundedInteger(requestTimeoutMs, 'request timeout', 30_000);
  boundedInteger(operationTimeoutMs, 'operation timeout', 120_000);
  boundedInteger(maximumResponseBytes, 'response size bound', 1024 * 1024);

  // Keep caller-owned objects from changing the preparation target across awaits.
  const input = {
    organizationSlug,
    estateName,
    appNames: Object.fromEntries(
      SERVICE_NAMES.map((service) => [service, appNames[service]]),
    ),
    serviceSpecs: Object.fromEntries(
      SERVICE_NAMES.map((service) => {
        const spec = serviceSpecs[service];
        return [
          service,
          {
            ...spec,
            resources: { ...spec.resources },
            environment: { ...spec.environment },
          },
        ];
      }),
    ),
  };

  const operationSignal = AbortSignal.timeout(operationTimeoutMs);
  const request = createClient({
    token,
    transport,
    operationSignal,
    requestTimeoutMs,
    maximumResponseBytes,
  });

  // Complete and validate every read-only inventory before the first POST.
  const inventory = new Map();
  for (const service of SERVICE_NAMES)
    inventory.set(service, await inventoryService(request, input, service));

  const prepared = [];
  for (const service of SERVICE_NAMES) {
    const inventoried = inventory.get(service);
    const existing = await inventoryService(request, input, service);
    if (
      (inventoried === null && existing !== null) ||
      (inventoried !== null && existing?.id !== inventoried.id)
    )
      fail(`${service} Machine inventory changed before preparation`);
    let machine;
    let action;
    if (existing === null) {
      machine = await createMachine(request, input, service);
      action = 'created';
    } else if (
      configMatches(
        existing,
        input.estateName,
        service,
        input.serviceSpecs[service],
      )
    ) {
      machine = existing;
      action = 'reused';
    } else {
      machine = await updateMachine(request, input, service, existing);
      action = 'updated';
    }
    prepared.push({
      service,
      appName: input.appNames[service],
      machineId: machine.id,
      image: input.serviceSpecs[service].image,
      region: input.serviceSpecs[service].region,
      action,
    });
  }

  // A fresh account/app-scoped inventory is the success boundary.
  for (const service of SERVICE_NAMES) {
    const machine = await inventoryService(request, input, service);
    if (
      machine === null ||
      machine.id !==
        prepared.find((item) => item.service === service)?.machineId ||
      !configMatches(
        machine,
        input.estateName,
        service,
        input.serviceSpecs[service],
      )
    )
      fail(`${service} did not remain the exact nonrunning prepared Machine`);
  }

  return {
    organizationSlug,
    prepared,
    activationRequired: true,
    qualificationComplete: false,
  };
}

export const FLY_MACHINE_PREPARATION_SERVICE_NAMES = SERVICE_NAMES;
