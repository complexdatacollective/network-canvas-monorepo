import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { BackgroundDocument } from '../../model/types';
import { fixtureDocument, fixturePoints } from '../fixtures';
import { generatePythonScript } from '../python';
import { buildFixtureCsv, parseCsv, toRecords } from './csvTestHelpers';

function pythonAvailable(): boolean {
  const result = spawnSync('python3', ['--version']);
  return !result.error && result.status === 0;
}

const pythonMissing = !pythonAvailable();
const defaultOpts = { layoutVariable: 'location', outputVariable: 'zone' };

describe.skipIf(pythonMissing)('generated Python script executes', () => {
  const script = generatePythonScript(fixtureDocument, defaultOpts);
  let dir = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'bgc-py-'));
  });

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('assigns fixture zones and leaves unassigned nodes empty (default columns)', () => {
    const scriptPath = join(dir, 'assign_zones.py');
    const inputPath = join(dir, 'in.csv');
    const outputPath = join(dir, 'out.csv');
    writeFileSync(scriptPath, script);
    writeFileSync(inputPath, buildFixtureCsv('location', fixturePoints));

    const result = spawnSync('python3', [scriptPath, inputPath, outputPath], {
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

  it('honours --layout-variable and --output-variable overrides', () => {
    const scriptPath = join(dir, 'override.py');
    const inputPath = join(dir, 'override-in.csv');
    const outputPath = join(dir, 'override-out.csv');
    writeFileSync(scriptPath, script);
    writeFileSync(inputPath, buildFixtureCsv('position', fixturePoints));

    const result = spawnSync(
      'python3',
      [
        scriptPath,
        inputPath,
        outputPath,
        '--layout-variable',
        'position',
        '--output-variable',
        'region',
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
    const scriptPath = join(dir, 'missing.py');
    const inputPath = join(dir, 'missing-in.csv');
    const outputPath = join(dir, 'missing-out.csv');
    writeFileSync(scriptPath, script);
    writeFileSync(inputPath, 'id,name,foo_x,foo_y\nn0,Node 0,0.5,0.5\n');

    const result = spawnSync('python3', [scriptPath, inputPath, outputPath], {
      encoding: 'utf-8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('missing required column');
    expect(result.stderr).toContain('location_x');
    expect(result.stderr).toContain('Found columns');
    expect(result.stderr).toContain('foo_x');
  });

  it('exits 1 without truncating an existing output when a row is ragged', () => {
    const scriptPath = join(dir, 'ragged.py');
    const inputPath = join(dir, 'ragged-in.csv');
    const outputPath = join(dir, 'ragged-out.csv');
    writeFileSync(scriptPath, script);
    // First data row is well-formed; the second has two extra cells.
    writeFileSync(
      inputPath,
      'id,name,location_x,location_y\nn0,Node 0,0.5,0.5\nn1,Node 1,0.5,0.5,EXTRA,MORE\n',
    );
    // A pre-existing output file that the run must not destroy: validation
    // happens before the output is opened for writing.
    const sentinel = 'keep me\n';
    writeFileSync(outputPath, sentinel);

    const result = spawnSync('python3', [scriptPath, inputPath, outputPath], {
      encoding: 'utf-8',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('more cells than the header');
    // The message counts the offending data row (the second one here).
    expect(result.stderr).toContain('row 2');
    // The existing output file is untouched — not truncated or partially written.
    expect(readFileSync(outputPath, 'utf-8')).toBe(sentinel);
  });

  it('neutralizes a hostile title so it cannot inject executable code', () => {
    // A bare CR is a line break to the Python tokenizer, so without sanitization
    // the text after it would escape the "# Background:" comment and run.
    const hostileTitle = 'ok\r__import__("os").system("echo PWNED")';
    const scriptPath = join(dir, 'hostile-title.py');
    const inputPath = join(dir, 'hostile-title-in.csv');
    const outputPath = join(dir, 'hostile-title-out.csv');
    writeFileSync(
      scriptPath,
      generatePythonScript(
        { ...fixtureDocument, title: hostileTitle },
        defaultOpts,
      ),
    );
    writeFileSync(inputPath, 'id,location_x,location_y\nn0,0.5,0.5\n');

    const result = spawnSync('python3', [scriptPath, inputPath, outputPath], {
      encoding: 'utf-8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    // The injected payload never executes.
    expect(result.stdout).not.toContain('PWNED');
  });

  it('reads a UTF-8 BOM input without a spurious missing-column error', () => {
    const scriptPath = join(dir, 'bom.py');
    const inputPath = join(dir, 'bom-in.csv');
    const outputPath = join(dir, 'bom-out.csv');
    writeFileSync(scriptPath, script);
    // A leading UTF-8 BOM (U+FEFF, bytes EF BB BF) precedes the header.
    const bom = String.fromCharCode(0xfeff);
    writeFileSync(inputPath, `${bom}id,location_x,location_y\nn0,0.5,0.5\n`);

    const result = spawnSync('python3', [scriptPath, inputPath, outputPath], {
      encoding: 'utf-8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const { header, records } = toRecords(
      parseCsv(readFileSync(outputPath, 'utf-8')),
    );
    // The first column name is "id", not a BOM-prefixed variant.
    expect(header).toEqual(['id', 'location_x', 'location_y', 'zone']);
    // (0.5, 0.5) is the centre of all rings, so the smallest wins.
    expect(records[0]?.zone).toBe('inner');
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
    const scriptPath = join(dir, 'hostile.py');
    const inputPath = join(dir, 'hostile-in.csv');
    const outputPath = join(dir, 'hostile-out.csv');
    writeFileSync(
      scriptPath,
      generatePythonScript(hostileDocument, defaultOpts),
    );
    writeFileSync(inputPath, 'id,location_x,location_y\nn0,0.5,0.5\n');

    const result = spawnSync('python3', [scriptPath, inputPath, outputPath], {
      encoding: 'utf-8',
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);

    const { records } = toRecords(parseCsv(readFileSync(outputPath, 'utf-8')));
    expect(records[0]?.zone).toBe(hostileLabel);
  });
});
