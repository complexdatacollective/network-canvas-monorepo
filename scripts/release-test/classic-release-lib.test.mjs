import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  inspectInterviewerExport,
  parseCsv,
  parseGradleVersionName,
  parsePbxMarketingVersions,
} from './classic-release-lib.mjs';

describe('parseCsv', () => {
  it('reads quoted fields, escaped quotes and CRLF rows', () => {
    const rows = parseCsv('name,note\r\n"Smith, Jo","said ""hi"""\r\nBob,\r\n');
    expect(rows).toEqual([
      { name: 'Smith, Jo', note: 'said "hi"' },
      { name: 'Bob', note: '' },
    ]);
  });
});

const EXPECTED = {
  caseId: 'release-test',
  appVersion: '6.6.2',
  nodeType: 'Person',
  nodeNames: ['Alice', 'Bob', 'Carol'],
  layoutVariable: 'sociogram_layout',
  edgeType: 'know',
  edgeCount: 1,
};

// An export shaped like Interviewer Classic's: <caseId>_<sessionId>_<file>.
async function exportZip({
  appVersion = '6.6.2',
  placed = true,
  edges = 1,
  nodes = ['Alice', 'Bob', 'Carol'],
} = {}) {
  const zip = new JSZip();
  const prefix = 'release-test_6e638b6a';
  zip.file(`${prefix}.graphml`, '<?xml version="1.0"?><graphml></graphml>');
  zip.file(
    `${prefix}_ego.csv`,
    `networkCanvasCaseID,sessionFinish,sessionExported,APP_VERSION\nrelease-test,2026-10-02T06:42:28.692Z,2026-10-02T06:42:28.873Z,${appVersion}\n`,
  );
  zip.file(
    `${prefix}_attributeList_Person.csv`,
    `nodeID,name,sociogram_layout_x,sociogram_layout_y\n${nodes
      .map(
        (n, i) => `${i + 1},${n},${placed ? '0.5' : ''},${placed ? '0.4' : ''}`,
      )
      .join('\n')}\n`,
  );
  if (edges) {
    zip.file(
      `${prefix}_edgeList_know.csv`,
      `edgeID,from,to\n${Array.from({ length: edges }, (_, i) => `${i + 1},1,2`).join('\n')}\n`,
    );
  } else {
    zip.file(`${prefix}_edgeList.csv`, 'edgeID,from,to\n');
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

const failures = (checks) => checks.filter((c) => !c.ok).map((c) => c.check);

describe('inspectInterviewerExport', () => {
  it('passes an export of the conducted session', async () => {
    const checks = await inspectInterviewerExport(await exportZip(), EXPECTED);
    expect(failures(checks)).toEqual([]);
  });

  // 6.6.1 and earlier wrote an empty APP_VERSION.
  it('fails an export without the app version', async () => {
    const checks = await inspectInterviewerExport(
      await exportZip({ appVersion: '' }),
      EXPECTED,
    );
    expect(failures(checks)).toEqual(['APP_VERSION is the build under test']);
  });

  it('fails nodes without sociogram positions and a missing edge list', async () => {
    const checks = await inspectInterviewerExport(
      await exportZip({ placed: false, edges: 0 }),
      EXPECTED,
    );
    expect(failures(checks)).toEqual([
      'every node has a sociogram position',
      'export contains 1 know edge(s)',
    ]);
  });

  it('fails an export missing a created node', async () => {
    const checks = await inspectInterviewerExport(
      await exportZip({ nodes: ['Alice', 'Bob'] }),
      EXPECTED,
    );
    expect(failures(checks)).toEqual(['exported nodes are the ones created']);
  });

  it('reports an unreadable zip instead of throwing', async () => {
    const checks = await inspectInterviewerExport(
      Buffer.from('not a zip'),
      EXPECTED,
    );
    expect(failures(checks)).toEqual(['export is a readable zip']);
  });
});

describe('native version stamps', () => {
  it('reads the Android versionName', () => {
    expect(
      parseGradleVersionName(
        'android {\n  defaultConfig {\n    versionCode 1\n    versionName "6.6.2"\n  }\n}',
      ),
    ).toBe('6.6.2');
  });

  it('collects every distinct iOS MARKETING_VERSION', () => {
    expect(
      parsePbxMarketingVersions(
        'MARKETING_VERSION = 6.6.2;\nMARKETING_VERSION = 6.6.2;\nMARKETING_VERSION = 6.6.1;',
      ),
    ).toEqual(['6.6.2', '6.6.1']);
  });
});
