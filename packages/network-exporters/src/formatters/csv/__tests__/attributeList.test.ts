import { describe, expect, it } from 'vitest';

import type { Codebook } from '@codaco/protocol-validation';
import {
  egoProperty,
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  ncUUIDProperty,
  nodeExportIDProperty,
  protocolName,
} from '@codaco/shared-consts';

import type { SessionWithResequencedIDs } from '../../../input';
import { attributeListRows } from '../attributeList';
import { mockCodebook, mockExportOptions } from './mockObjects';

const makeNetwork = (
  nodes: SessionWithResequencedIDs['nodes'],
): SessionWithResequencedIDs =>
  ({
    nodes,
    edges: [],
    sessionVariables: { [protocolName]: 'Protocol' },
  }) as unknown as SessionWithResequencedIDs;

describe('attributeListRows', () => {
  it('yields header followed by one row per node', () => {
    const network = makeNetwork([
      {
        [nodeExportIDProperty]: 1,
        [egoProperty]: 'ego-1',
        [entityPrimaryKeyProperty]: 'uid-1',
        type: 'mock-node-type',
        [entityAttributesProperty]: { 'mock-uuid-1': 'Jane' },
      } as SessionWithResequencedIDs['nodes'][number],
    ]);

    const rows = Array.from(
      attributeListRows(
        network,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain(nodeExportIDProperty);
    expect(rows[0]).toContain(egoProperty);
    expect(rows[0]).toContain(ncUUIDProperty);
    expect(rows[0]).toContain('firstName');
    expect(rows[1]).toContain('Jane');
  });

  it('neutralizes a formula-injection attribute value in the emitted CSV', () => {
    const network = makeNetwork([
      {
        [nodeExportIDProperty]: 1,
        [egoProperty]: 'ego-1',
        [entityPrimaryKeyProperty]: 'uid-1',
        type: 'mock-node-type',
        [entityAttributesProperty]: {
          'mock-uuid-1': '=HYPERLINK("https://evil.example","click")',
        },
      } as SessionWithResequencedIDs['nodes'][number],
    ]);

    const rows = Array.from(
      attributeListRows(
        network,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );

    // The cell is both prefixed (formula neutralized) and quoted (contains a comma).
    expect(rows[1]).toContain(
      '"\'=HYPERLINK(""https://evil.example"",""click"")"',
    );
    expect(rows[1]).not.toContain(',=HYPERLINK');
  });

  it('guards a header that could run as a formula, as it does the answers', () => {
    const codebook = {
      node: {
        'mock-node-type': {
          name: 'person',
          label: { en: 'Person' },
          color: 'node-color-seq-1',
          shape: { default: 'circle' },
          variables: {
            'v-total': { name: '=total', label: 'Total', type: 'text' },
            'v-score': {
              name: '-score, adjusted',
              label: 'Score adjusted',
              type: 'text',
            },
          },
        },
      },
    } satisfies Codebook;
    const network = makeNetwork([
      {
        [nodeExportIDProperty]: 1,
        [egoProperty]: 'ego-1',
        [entityPrimaryKeyProperty]: 'uid-1',
        type: 'mock-node-type',
        [entityAttributesProperty]: { 'v-total': '=1+1', 'v-score': '-2' },
      } as SessionWithResequencedIDs['nodes'][number],
    ]);

    const [header, row] = Array.from(
      attributeListRows(network, codebook, mockExportOptions, () => undefined),
    );

    expect(header).toBe(
      `${nodeExportIDProperty},${egoProperty},${ncUUIDProperty},'=total,"'-score, adjusted"\r\n`,
    );
    expect(row).toBe("1,ego-1,uid-1,'=1+1,'-2\r\n");
  });

  it('yields only the header for an empty network', () => {
    const network = makeNetwork([]);
    const rows = Array.from(
      attributeListRows(
        network,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );
    expect(rows).toHaveLength(1);
  });

  it('includes declared columns that are unanswered by every node', () => {
    const network = makeNetwork([
      {
        [nodeExportIDProperty]: 1,
        [egoProperty]: 'ego-1',
        [entityPrimaryKeyProperty]: 'uid-1',
        type: 'mock-node-type',
        [entityAttributesProperty]: {},
      } as SessionWithResequencedIDs['nodes'][number],
    ]);

    const rows = Array.from(
      attributeListRows(
        network,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );

    expect(rows[0]).toContain('unusedBool');
  });

  it('includes present external attributes', () => {
    const network = makeNetwork([
      {
        [nodeExportIDProperty]: 1,
        [egoProperty]: 'ego-1',
        [entityPrimaryKeyProperty]: 'uid-1',
        type: 'mock-node-type',
        [entityAttributesProperty]: { externalAttribute: 'external value' },
      } as SessionWithResequencedIDs['nodes'][number],
    ]);

    const rows = Array.from(
      attributeListRows(
        network,
        mockCodebook,
        mockExportOptions,
        () => undefined,
      ),
    );

    expect(rows[0]).toContain('externalAttribute');
    expect(rows[1]).toContain('external value');
  });
});
