// Typed fetch wrappers for the Netlify functions behind /api.

import type {
  ConfigResponse,
  CreateJobRequest,
  CreateJobResponse,
  JobStatus,
  PreferenceRequest,
} from '../shared/api.ts';

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

const GENERIC_ERROR = 'Sketch could not reach its server. Please try again.';

const readError = async (response: Response): Promise<string> => {
  try {
    const body: unknown = await response.json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof body.error === 'string' &&
      body.error.length > 0
    ) {
      return body.error;
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return GENERIC_ERROR;
};

const send = async (
  path: string,
  init: RequestInit = {},
): Promise<Response> => {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: {
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiRequestError(GENERIC_ERROR, 0);
  }
  if (!response.ok) {
    throw new ApiRequestError(await readError(response), response.status);
  }
  return response;
};

const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await send(path, init);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the server is typed against the same shared contract
  return (await response.json()) as T;
};

export const getConfig = (signal?: AbortSignal) =>
  request<ConfigResponse>('/api/config', { signal });

export const createJob = (body: CreateJobRequest, signal?: AbortSignal) =>
  request<CreateJobResponse>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });

export const getJob = (jobId: string, signal?: AbortSignal) =>
  request<JobStatus>(`/api/jobs/${encodeURIComponent(jobId)}`, { signal });

export const sendPreference = async (body: PreferenceRequest) => {
  await send('/api/preference', {
    method: 'POST',
    body: JSON.stringify(body),
  });
};
