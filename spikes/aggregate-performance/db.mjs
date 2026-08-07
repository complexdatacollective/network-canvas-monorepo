import pg from 'pg';

const PORT = Number(process.env.PGPORT ?? 54318);

export function client(user, password = 'spike') {
  return new pg.Client({
    host: '127.0.0.1',
    port: PORT,
    user,
    password,
    database: 'studio_spike',
  });
}

export function pool(user, max = 10, password = 'spike') {
  return new pg.Pool({
    host: '127.0.0.1',
    port: PORT,
    user,
    password,
    database: 'studio_spike',
    max,
  });
}

// Fixed IDs so seed/bench agree without a lookup step.
export const WORKSPACES = {
  main: '00000000-0000-4000-8000-000000000001',
  noiseA: '00000000-0000-4000-8000-000000000002',
  noiseB: '00000000-0000-4000-8000-000000000003',
};

export const STUDIES = {
  main: '00000000-0000-4000-8000-000000000101',
  noiseA: '00000000-0000-4000-8000-000000000102',
  noiseB: '00000000-0000-4000-8000-000000000103',
};
