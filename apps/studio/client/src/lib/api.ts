import { type Status, StatusSchema } from '../../../shared/api-schemas.ts';

export async function fetchStatus(): Promise<Status> {
  const res = await fetch('/api/v1/status');
  if (!res.ok) {
    throw new Error(`Status request failed with ${res.status}`);
  }
  return StatusSchema.parse(await res.json());
}
