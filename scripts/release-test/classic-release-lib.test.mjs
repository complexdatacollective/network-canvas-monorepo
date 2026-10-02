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
  edgeBetween: ['Alice', 'Bob'],
};

const graphmlDocument = ({ nodes, edge }) =>
  `<?xml version="1.0" encoding="UTF-8"?><graphml xmlns="http://graphml.graphdrawing.org/xmlns"><key id="label" attr.name="label" attr.type="string" for="node"/><graph edgedefault="undirected">${nodes
    .map((n, i) => `<node id="${i + 1}"><data key="label">${n}</data></node>`)
    .join(
      '',
    )}${edge ? `<edge id="1" source="${edge[0]}" target="${edge[1]}"/>` : ''}</graph></graphml>`;

// An export shaped like Interviewer Classic's: <caseId>_<sessionId>_<file>,
// node and edge IDs numbered from 1 in node-list order.
async function exportZip({
  appVersion = '6.6.2',
  x = '0.5',
  y = '0.4',
  edge = [1, 2],
  nodes = ['Alice', 'Bob', 'Carol'],
  graphml,
} = {}) {
  const zip = new JSZip();
  const prefix = 'release-test_6e638b6a';
  zip.file(`${prefix}.graphml`, graphml ?? graphmlDocument({ nodes, edge }));
  zip.file(
    `${prefix}_ego.csv`,
    `networkCanvasCaseID,sessionFinish,sessionExported,APP_VERSION\nrelease-test,2026-10-02T06:42:28.692Z,2026-10-02T06:42:28.873Z,${appVersion}\n`,
  );
  zip.file(
    `${prefix}_attributeList_Person.csv`,
    `nodeID,name,sociogram_layout_x,sociogram_layout_y\n${nodes
      .map((n, i) => `${i + 1},${n},${x},${y}`)
      .join('\n')}\n`,
  );
  if (edge) {
    zip.file(
      `${prefix}_edgeList_know.csv`,
      `edgeID,from,to\n1,${edge[0]},${edge[1]}\n`,
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

  it('fails nodes missing either sociogram coordinate', async () => {
    for (const missing of [{ x: '' }, { y: '' }, { y: 'NaN' }]) {
      const checks = await inspectInterviewerExport(
        await exportZip(missing),
        EXPECTED,
      );
      expect(failures(checks)).toEqual(['every node has a sociogram position']);
    }
  });

  it('fails a missing edge list', async () => {
    const checks = await inspectInterviewerExport(
      await exportZip({ edge: null }),
      EXPECTED,
    );
    expect(failures(checks)).toEqual([
      'graphml has the Alice–Bob edge',
      'export contains 1 know edge(s)',
    ]);
  });

  it('fails an edge between the wrong nodes', async () => {
    const checks = await inspectInterviewerExport(
      await exportZip({ edge: [1, 3] }),
      EXPECTED,
    );
    expect(failures(checks)).toEqual([
      'graphml has the Alice–Bob edge',
      'the know edge connects Alice–Bob',
    ]);
  });

  it('fails a truncated or empty graphml', async () => {
    const truncated = await inspectInterviewerExport(
      await exportZip({ graphml: '<?xml version="1.0"?><graphml><graph>' }),
      EXPECTED,
    );
    expect(failures(truncated)).toEqual(['graphml parses as XML']);
    const empty = await inspectInterviewerExport(
      await exportZip({
        graphml: '<?xml version="1.0"?><graphml><graph/></graphml>',
      }),
      EXPECTED,
    );
    expect(failures(empty)).toEqual([
      'graphml nodes are the ones created',
      'graphml has the Alice–Bob edge',
    ]);
  });

  it('fails an export missing a created node', async () => {
    const checks = await inspectInterviewerExport(
      await exportZip({ nodes: ['Alice', 'Bob'] }),
      EXPECTED,
    );
    expect(failures(checks)).toEqual([
      'graphml nodes are the ones created',
      'exported nodes are the ones created',
    ]);
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
