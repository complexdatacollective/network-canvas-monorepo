import {
  readTemplateArtifact,
  templateBytesHash,
  TEMPLATE_ARTIFACT_LIMITS,
  TEMPLATE_ARTIFACT_MEDIA_TYPE,
  TemplateContentHashSchema,
  type VerifiedTemplateArtifact,
} from './template-exchange.ts';
import {
  RegistryCredentialSchema,
  RegistryEntryIdSchema,
  RegistryEntrySchema,
  type RegistryEntry,
  RegistryPublisherSchema,
  type RegistryPublisher,
} from './template-registry-contract.ts';

const JSON_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_DEADLINE_MS = 15_000;
const MAX_DEADLINE_MS = 60_000;

export type TemplateRegistryClientErrorCode =
  | 'TEMPLATE_REGISTRY_CONFIGURATION_INVALID'
  | 'TEMPLATE_REGISTRY_REQUEST_FAILED'
  | 'TEMPLATE_REGISTRY_RESPONSE_INVALID'
  | 'TEMPLATE_REGISTRY_ARTIFACT_INVALID';

/** Stable errors never include origins, credentials, response bodies or URLs. */
export class TemplateRegistryClientError extends Error {
  readonly code: TemplateRegistryClientErrorCode;

  constructor(code: TemplateRegistryClientErrorCode) {
    super(code);
    this.name = 'TemplateRegistryClientError';
    this.code = code;
  }
}

type DeadlineContext = {
  signal: AbortSignal;
  race<T>(work: Promise<T>): Promise<T>;
  setCancellation(cancel: (() => Promise<unknown>) | undefined): void;
};

function failure(code: TemplateRegistryClientErrorCode): never {
  throw new TemplateRegistryClientError(code);
}

function cancelWithoutWaiting(cancel: (() => Promise<unknown>) | undefined) {
  try {
    const pending = cancel?.();
    if (pending) void pending.catch(() => undefined);
  } catch {
    // A custom transport cannot delay or replace the fixed caller failure.
  }
}

async function boundedOperation<T>(
  deadlineMs: number,
  outerSignal: AbortSignal | undefined,
  operation: (context: DeadlineContext) => Promise<T>,
): Promise<T> {
  const deadline = new AbortController();
  const signal = outerSignal
    ? AbortSignal.any([outerSignal, deadline.signal])
    : deadline.signal;
  let cancellation: (() => Promise<unknown>) | undefined;
  let rejectStopped: (() => void) | undefined;
  let hasStopped = false;
  const expiresAt = performance.now() + deadlineMs;
  const stopped = new Promise<never>((_, reject) => {
    rejectStopped = () => reject(new Error());
  });
  const stop = () => {
    if (hasStopped) return;
    hasStopped = true;
    deadline.abort();
    cancelWithoutWaiting(cancellation);
    rejectStopped?.();
  };
  const timer = setTimeout(stop, deadlineMs);
  signal.addEventListener('abort', stop, { once: true });
  const assertActive = () => {
    if (signal.aborted || performance.now() >= expiresAt) {
      stop();
      throw new Error();
    }
  };
  const context: DeadlineContext = {
    signal,
    race: async <R>(work: Promise<R>) => {
      assertActive();
      const result = await Promise.race([work, stopped]);
      assertActive();
      return result;
    },
    setCancellation: (next) => {
      cancellation = next;
    },
  };
  try {
    if (signal.aborted) throw new Error();
    return await context.race(operation(context));
  } catch (error) {
    if (error instanceof TemplateRegistryClientError) throw error;
    return failure('TEMPLATE_REGISTRY_REQUEST_FAILED');
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }
}

function mediaType(response: Response): string {
  return (response.headers.get('content-type') ?? '')
    .split(';', 1)[0]!
    .trim()
    .toLowerCase();
}

function declaredBodySize(response: Response, maximum: number): void {
  const declared = response.headers.get('content-length');
  if (!declared) return;
  if (!/^(?:0|[1-9][0-9]*)$/.test(declared))
    failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
  if (BigInt(declared) > BigInt(maximum))
    failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
}

async function readBody(
  response: Response,
  maximum: number,
  context: DeadlineContext,
): Promise<Uint8Array> {
  declaredBodySize(response, maximum);
  if (!response.body) failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
  const reader = response.body.getReader();
  context.setCancellation(async () => await reader.cancel());
  let bytes = new Uint8Array(Math.min(maximum, 8192));
  let total = 0;
  let complete = false;
  try {
    for (;;) {
      const result = await context.race(reader.read());
      if (result.done) break;
      if (result.value.byteLength === 0)
        failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
      if (result.value.byteLength > maximum - total)
        failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
      const nextTotal = total + result.value.byteLength;
      if (nextTotal > bytes.byteLength) {
        const grown = new Uint8Array(
          Math.min(
            maximum,
            Math.max(nextTotal, Math.max(1, bytes.byteLength) * 2),
          ),
        );
        grown.set(bytes.subarray(0, total));
        bytes = grown;
      }
      bytes.set(result.value, total);
      total = nextTotal;
    }
    complete = true;
  } finally {
    if (!complete) cancelWithoutWaiting(async () => await reader.cancel());
    context.setCancellation(undefined);
    try {
      reader.releaseLock();
    } catch {
      // A transport may retain a pending read after the absolute deadline.
    }
  }
  return bytes.slice(0, total);
}

function exactOrigin(value: string): string {
  try {
    if (value.length > 2048) throw new Error();
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    )
      throw new Error();
    return parsed.origin;
  } catch {
    return failure('TEMPLATE_REGISTRY_CONFIGURATION_INVALID');
  }
}

function pathUrl(origin: string, path: string): string {
  return new URL(path, `${origin}/`).href;
}

function assertEntryUrls(origin: string, entry: RegistryEntry): void {
  if (
    entry.artifact_url !== pathUrl(origin, `/api/v1/artifacts/${entry.root}`) ||
    entry.report_url !== pathUrl(origin, `/api/v1/entries/${entry.id}/reports`)
  )
    failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
}

async function parseEntry(
  response: Response,
  expectedStatus: number,
  origin: string,
  context: DeadlineContext,
): Promise<RegistryEntry> {
  if (
    response.status !== expectedStatus ||
    mediaType(response) !== 'application/json'
  )
    failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
  const bytes = await readBody(response, JSON_RESPONSE_BYTES, context);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const entry = RegistryEntrySchema.parse(JSON.parse(text));
    assertEntryUrls(origin, entry);
    return entry;
  } catch (error) {
    if (error instanceof TemplateRegistryClientError) throw error;
    return failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
  }
}

async function parsePublisher(
  response: Response,
  context: DeadlineContext,
): Promise<RegistryPublisher> {
  if (response.status !== 200 || mediaType(response) !== 'application/json')
    failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
  const bytes = await readBody(response, JSON_RESPONSE_BYTES, context);
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return RegistryPublisherSchema.parse(JSON.parse(text));
  } catch {
    return failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
  }
}

export type FetchedRegistryArtifact = {
  root: string;
  rawHash: string;
  yanked: boolean;
  bytes: Uint8Array;
  artifact: VerifiedTemplateArtifact;
};

export type TemplateRegistryClientOptions = {
  origin: string;
  deadlineMs?: number;
  fetch?: typeof fetch;
};

/** Bounded Registry wire client. Public reads have no credential input. */
export class TemplateRegistryClient {
  readonly #origin: string;
  readonly #deadlineMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: TemplateRegistryClientOptions) {
    this.#origin = exactOrigin(options.origin);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    if (
      !Number.isInteger(this.#deadlineMs) ||
      this.#deadlineMs < 1 ||
      this.#deadlineMs > MAX_DEADLINE_MS
    )
      failure('TEMPLATE_REGISTRY_CONFIGURATION_INVALID');
  }

  async publisher(
    credential: string,
    signal?: AbortSignal,
  ): Promise<RegistryPublisher> {
    const parsedCredential = RegistryCredentialSchema.safeParse(credential);
    if (!parsedCredential.success) failure('TEMPLATE_REGISTRY_REQUEST_FAILED');
    return await boundedOperation(this.#deadlineMs, signal, async (context) => {
      const response = await context.race(
        this.#fetch(pathUrl(this.#origin, '/publisher'), {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${parsedCredential.data}`,
          },
          redirect: 'manual',
          signal: context.signal,
        }),
      );
      context.setCancellation(async () => await response.body?.cancel());
      let complete = false;
      try {
        const publisher = await parsePublisher(response, context);
        complete = true;
        return publisher;
      } finally {
        if (!complete)
          cancelWithoutWaiting(async () => await response.body?.cancel());
        context.setCancellation(undefined);
      }
    });
  }

  async entry(id: string, signal?: AbortSignal): Promise<RegistryEntry> {
    const parsedId = RegistryEntryIdSchema.safeParse(id);
    if (!parsedId.success) failure('TEMPLATE_REGISTRY_REQUEST_FAILED');
    return await boundedOperation(this.#deadlineMs, signal, async (context) => {
      const response = await context.race(
        this.#fetch(pathUrl(this.#origin, `/api/v1/entries/${parsedId.data}`), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          redirect: 'manual',
          signal: context.signal,
        }),
      );
      context.setCancellation(async () => await response.body?.cancel());
      let complete = false;
      try {
        const entry = await parseEntry(response, 200, this.#origin, context);
        if (entry.id !== parsedId.data)
          failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
        complete = true;
        return entry;
      } finally {
        if (!complete)
          cancelWithoutWaiting(async () => await response.body?.cancel());
        context.setCancellation(undefined);
      }
    });
  }

  async fetchArtifact(
    root: string,
    signal?: AbortSignal,
  ): Promise<FetchedRegistryArtifact> {
    const parsedRoot = TemplateContentHashSchema.safeParse(root);
    if (!parsedRoot.success) failure('TEMPLATE_REGISTRY_REQUEST_FAILED');
    return await boundedOperation(this.#deadlineMs, signal, async (context) => {
      const response = await context.race(
        this.#fetch(
          pathUrl(this.#origin, `/api/v1/artifacts/${parsedRoot.data}`),
          {
            method: 'GET',
            headers: { Accept: TEMPLATE_ARTIFACT_MEDIA_TYPE },
            redirect: 'manual',
            signal: context.signal,
          },
        ),
      );
      context.setCancellation(async () => await response.body?.cancel());
      let complete = false;
      try {
        if (
          response.status !== 200 ||
          mediaType(response) !== TEMPLATE_ARTIFACT_MEDIA_TYPE ||
          response.headers.get('x-template-root') !== parsedRoot.data ||
          !['true', 'false'].includes(
            response.headers.get('x-registry-yanked') ?? '',
          )
        )
          failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
        const bytes = await readBody(
          response,
          TEMPLATE_ARTIFACT_LIMITS.archiveBytes,
          context,
        );
        const rawHash = templateBytesHash(bytes);
        if (response.headers.get('etag') !== `"${rawHash}"`)
          failure('TEMPLATE_REGISTRY_ARTIFACT_INVALID');
        let artifact: VerifiedTemplateArtifact;
        try {
          artifact = await readTemplateArtifact(bytes);
        } catch {
          failure('TEMPLATE_REGISTRY_ARTIFACT_INVALID');
        }
        if (artifact.manifest.merkle_root !== parsedRoot.data)
          failure('TEMPLATE_REGISTRY_ARTIFACT_INVALID');
        const result = {
          root: parsedRoot.data,
          rawHash,
          yanked: response.headers.get('x-registry-yanked') === 'true',
          bytes,
          artifact,
        };
        complete = true;
        return result;
      } finally {
        if (!complete)
          cancelWithoutWaiting(async () => await response.body?.cancel());
        context.setCancellation(undefined);
      }
    });
  }

  async publish(
    source: Uint8Array,
    credential: string,
    signal?: AbortSignal,
  ): Promise<RegistryEntry> {
    const parsedCredential = RegistryCredentialSchema.safeParse(credential);
    if (!parsedCredential.success) failure('TEMPLATE_REGISTRY_REQUEST_FAILED');
    if (source.byteLength > TEMPLATE_ARTIFACT_LIMITS.archiveBytes)
      failure('TEMPLATE_REGISTRY_ARTIFACT_INVALID');
    return await boundedOperation(this.#deadlineMs, signal, async (context) => {
      const bytes = Uint8Array.from(source);
      let artifact: VerifiedTemplateArtifact;
      try {
        artifact = await context.race(readTemplateArtifact(bytes));
      } catch (error) {
        if (context.signal.aborted) throw error;
        if (error instanceof TemplateRegistryClientError) throw error;
        failure('TEMPLATE_REGISTRY_ARTIFACT_INVALID');
      }
      const form = new FormData();
      form.set(
        'artifact',
        new File([bytes], 'template.nctemplate', {
          type: TEMPLATE_ARTIFACT_MEDIA_TYPE,
        }),
      );
      const response = await context.race(
        this.#fetch(pathUrl(this.#origin, '/api/v1/entries'), {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${parsedCredential.data}`,
          },
          body: form,
          redirect: 'manual',
          signal: context.signal,
        }),
      );
      context.setCancellation(async () => await response.body?.cancel());
      let complete = false;
      try {
        const entry = await parseEntry(response, 201, this.#origin, context);
        if (entry.root !== artifact.manifest.merkle_root)
          failure('TEMPLATE_REGISTRY_RESPONSE_INVALID');
        complete = true;
        return entry;
      } finally {
        if (!complete)
          cancelWithoutWaiting(async () => await response.body?.cancel());
        context.setCancellation(undefined);
      }
    });
  }
}
