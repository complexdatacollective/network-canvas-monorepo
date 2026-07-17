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

  it('passes non-coordinate columns through byte-faithfully', () => {
    const scriptPath = join(dir, 'passthrough.R');
    const inputPath = join(dir, 'passthrough-in.csv');
    const outputPath = join(dir, 'passthrough-out.csv');
    writeFileSync(scriptPath, script);
    // Values that read.csv's type inference would otherwise corrupt: a
    // zero-padded id, a literal string "NA", a scientific-notation token, and a
    // full-precision double.
    writeFileSync(
      inputPath,
      [
        'id,name,location_x,location_y',
        '007,NA,0.5,0.5',
        '00042,1e5,0.5,0.99',
        '0.30000000000000004,plain,0.5,0.5',
        '',
      ].join('\n'),
    );

    const result = spawnSync('Rscript', [scriptPath, inputPath, outputPath], {
      encoding: 'utf-8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const { header, records } = toRecords(
      parseCsv(readFileSync(outputPath, 'utf-8')),
    );
    expect(header).toEqual(['id', 'name', 'location_x', 'location_y', 'zone']);
    expect(records[0]?.id).toBe('007');
    expect(records[0]?.name).toBe('NA');
    expect(records[1]?.id).toBe('00042');
    expect(records[1]?.name).toBe('1e5');
    expect(records[1]?.location_y).toBe('0.99');
    expect(records[2]?.id).toBe('0.30000000000000004');
    // Zones are still assigned from the parsed numeric coordinates.
    expect(records[0]?.zone).toBe('inner');
    expect(records[1]?.zone).toBe('');
  });

  it('fails loudly (non-zero exit) when a row has more cells than the header', () => {
    const scriptPath = join(dir, 'ragged.R');
    const inputPath = join(dir, 'ragged-in.csv');
    const outputPath = join(dir, 'ragged-out.csv');
    writeFileSync(scriptPath, script);
    writeFileSync(
      inputPath,
      'id,name,location_x,location_y\nn0,Node 0,0.5,0.5,EXTRA,MORE\n',
    );

    const result = spawnSync('Rscript', [scriptPath, inputPath, outputPath], {
      encoding: 'utf-8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('more columns than column names');
  });

  it('rejects a space-separated flag with a non-zero exit and helpful message', () => {
    const scriptPath = join(dir, 'space-flag.R');
    const inputPath = join(dir, 'space-flag-in.csv');
    const outputPath = join(dir, 'space-flag-out.csv');
    writeFileSync(scriptPath, script);
    writeFileSync(inputPath, 'id,pos_x,pos_y\nn0,0.5,0.5\n');

    // The Python script accepts "--layout-variable pos"; the R script must not
    // silently drop it and fall back to the default variable.
    const result = spawnSync(
      'Rscript',
      [scriptPath, inputPath, outputPath, '--layout-variable', 'pos'],
      { encoding: 'utf-8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('--flag=value');
    expect(result.stderr).toContain('--layout-variable');
  });

  it('rejects more than two positional arguments', () => {
    const scriptPath = join(dir, 'extra-positional.R');
    const inputPath = join(dir, 'extra-in.csv');
    const outputPath = join(dir, 'extra-out.csv');
    writeFileSync(scriptPath, script);
    writeFileSync(inputPath, 'id,location_x,location_y\nn0,0.5,0.5\n');

    const result = spawnSync(
      'Rscript',
      [scriptPath, inputPath, outputPath, 'surprise.csv'],
      { encoding: 'utf-8' },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('too many arguments');
  });

  it('parses a label containing a nul character without emitting an illegal R escape', () => {
    const nul = String.fromCharCode(0);
    const replacement = String.fromCharCode(0xfffd);
    const nulDocument: BackgroundDocument = {
      version: 1,
      title: 'Nul',
      description: '',
      elements: [
        {
          id: 'n',
          kind: 'rect',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          fill: '#ffffff',
          fillOpacity: 0.25,
          stroke: null,
          strokeWidth: 1,
          zoneLabel: `a${nul}b`,
        },
      ],
    };
    const nulScript = generateRScript(nulDocument, defaultOpts);
    // A literal nul is illegal in R strings; the emitter must not produce \x00.
    expect(nulScript).not.toContain('\\x00');

    const scriptPath = join(dir, 'nul.R');
    const inputPath = join(dir, 'nul-in.csv');
    const outputPath = join(dir, 'nul-out.csv');
    writeFileSync(scriptPath, nulScript);
    writeFileSync(inputPath, 'id,location_x,location_y\nn0,0.5,0.5\n');

    const result = spawnSync('Rscript', [scriptPath, inputPath, outputPath], {
      encoding: 'utf-8',
    });
    // Rscript would halt with "nul character not allowed" if \x00 were emitted.
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const { records } = toRecords(parseCsv(readFileSync(outputPath, 'utf-8')));
    expect(records[0]?.zone).toBe(`a${replacement}b`);
  });

  it('round-trips a hostile zone label through the generated script', () => {
    const hostileLabel = 'He said "hi" \\ O\'Brien';
    const hostileDocument: BackgroundDocument = {
      version: 1,
      title: 'Hostile',
      description: '',
      elements: [
        {
          id: 'h',
          kind: 'rect',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          fill: '#ffffff',
          fillOpacity: 0.25,
          stroke: null,
          strokeWidth: 1,
          zoneLabel: hostileLabel,
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
