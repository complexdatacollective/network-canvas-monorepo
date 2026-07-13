import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { CurrentProtocol } from '@codaco/protocol-validation';

import type { SeedAsset } from '../fixtures/seed.js';

const FIXTURE_DIR = path.resolve(
  import.meta.dirname,
  '../../../../packages/protocols/e2e/all-interfaces',
);

export function loadAllInterfacesFixture(): {
  protocol: CurrentProtocol;
  assets: SeedAsset[];
} {
  const protocol = JSON.parse(
    readFileSync(path.join(FIXTURE_DIR, 'protocol.json'), 'utf8'),
  ) as CurrentProtocol;

  // `assetManifest`'s two loose assets (both `source`-backed files under
  // assets/) — `mapbox_token` is an inline `value` apikey with no `source`,
  // so it isn't a StoredAsset and isn't loaded here. Names mirror the
  // manifest's own `name` field so a seeded StoredAsset's `name` matches
  // what the app would display for it.
  const geojson = readFileSync(
    path.join(FIXTURE_DIR, 'assets', 'regions.geojson'),
    'utf8',
  );
  const roster = readFileSync(
    path.join(FIXTURE_DIR, 'assets', 'roster.json'),
    'utf8',
  );
  const assets: SeedAsset[] = [
    { assetId: 'geo_data', name: 'Regions', data: geojson },
    { assetId: 'roster_data', name: 'Roster', data: roster },
  ];
  return { protocol, assets };
}
