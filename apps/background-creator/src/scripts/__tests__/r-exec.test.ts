import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BackgroundDocument } from '../../model/types';
import { fixtureDocument, fixturePoints } from '../fixtures';
import { generateRScript } from '../r';
import { buildFixtureCsv, parseCsv, toRecords } from './csvTestHelpers';

function rscriptAvailable(): boolean {
  const result = spawnSync('Rscript', ['--version']);
  return !result.error && result.status === 0;
}

const rscriptMissing = !rscriptAvailable();
const defaultOpts = { layoutVariable: 'location', outputVariable: 'zone' };

describe.skipIf(rscriptMissing)('generated R script executes', () => {
  const script = generateRScript(fixtureDocument, defaultOpts);
  let dir = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'bgc-r-'));
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('assigns fixture zones and leaves unassigned nodes empty (default columns)', () => {
    const scriptPath = join(dir, 'assign_zones.R');
    const inputPath = join(dir, 'in.csv');
    const outputPath = join(dir, 'out.csv');
    writeFileSync(scriptPath, script);
    writeFileSync(inputPath, buildFixtureCsv('location', fixturePoints));

    const result = spawnSync('Rscript', [scriptPath, inputPath, outputPath], {
      encoding: 'utf-8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const { header, records } = toRecords(
      parseCsv(readFileSync(outputPath, 'utf-8')),
    );
    expect(header).toEqual(['id', 'name', 'location_x', 'location_y', 'zone']);
    expect(records).toHaveLength(fixturePoints.length);
    fixturePoints.forEach((entry, index) => {
      expect(records[index]?.zone, entry.name).toBe(entry.expected ?? '');
    });
  });

  it('honours --layout-variable= and --output-variable= overrides', () => {
    const scriptPath = join(dir, 'override.R');
    const inputPath = join(dir, 'override-in.csv');
    const outputPath = join(dir, 'override-out.csv');
    writeFileSync(scriptPath, script);
    writeFileSync(inputPath, buildFixtureCsv('position', fixturePoints));

    const result = spawnSync(
      'Rscript',
      [
        scriptPath,
        inputPath,
        outputPath,
        '--layout-variable=position',
        '--output-variable=region',
      ],
      { encoding: 'utf-8' },
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const { header, records } = toRecords(
      parseCsv(readFileSync(outputPath, 'utf-8')),
    );
    expect(header).toEqual([
      'id',
      'name',
      'position_x',
      'position_y',
      'region',
    ]);
    fixturePoints.forEach((entry, index) => {
      expect(records[index]?.region, entry.name).toBe(entry.expected ?? '');
    });
  });

  it('exits 1 with a helpful message when the layout columns are absent', () => {
    const scriptPath = join(dir, 'missing.R');
    const inputPath = join(dir, 'missing-in.csv');
    const outputPath = join(dir, 'missing-out.csv');
    writeFileSync(scriptPath, script);
    writeFileSync(inputPath, 'id,name,foo_x,foo_y\nn0,Node 0,0.5,0.5\n');

    const result = spawnSync('Rscript', [scriptPath, inputPath, outputPath], {
      encoding: 'utf-8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing required column');
    expect(result.stderr).toContain('location_x');
    expect(result.stderr).toContain('Found columns');
    expect(result.stderr).toContain('foo_x');
  });

  it('round-trips a hostile zone label through the generated script', () => {
    const hostileLabel = 'He said "hi" \\ O\'Brien';
    const hostileDocument: BackgroundDocument = {
      version: 1,
      title: 'Hostile',
      description: '',
      elements: [],
      zones: [
        {
          id: 'h',
          label: hostileLabel,
          shape: 'rect',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
        },
      ],
    };
    const scriptPath = join(dir, 'hostile.R');
    const inputPath = join(dir, 'hostile-in.csv');
    const outputPath = join(dir, 'hostile-out.csv');
    writeFileSync(scriptPath, generateRScript(hostileDocument, defaultOpts));
    writeFileSync(inputPath, 'id,location_x,location_y\nn0,0.5,0.5\n');

    const result = spawnSync('Rscript', [scriptPath, inputPath, outputPath], {
      encoding: 'utf-8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const { records } = toRecords(parseCsv(readFileSync(outputPath, 'utf-8')));
    expect(records[0]?.zone).toBe(hostileLabel);
  });
});
