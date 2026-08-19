import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  entityAttributesProperty,
  entityPrimaryKeyProperty,
  type NcNode,
} from '@codaco/shared-consts';

const onRequestAsset = vi.fn<(assetId: string) => Promise<string>>();
const parseExternalNetworkAsset = vi.fn();
// Stable identity: this is an effect dependency, so a new function per render
// would re-run the read forever.
const captureException = vi.fn();

const contractHandlers = { onRequestAsset };

vi.mock('../../contract/context', () => ({
  useContractHandlers: () => contractHandlers,
}));

vi.mock('../../analytics/useTrack', () => ({
  useCaptureException: () => captureException,
}));

vi.mock('../../contract/rosterData', () => ({
  parseExternalNetworkAsset: (...args: unknown[]) =>
    parseExternalNetworkAsset(...args),
}));

vi.mock('../../store/modules/protocol', () => ({
  getAssetManifest: 'getAssetManifest',
  getCodebook: 'getCodebook',
}));

const assetManifest: Record<
  string,
  { assetId: string; name: string; source?: string }
> = {
  'asset-1': { assetId: 'asset-1', name: 'roster.csv', source: 'roster.csv' },
};

// Both results must keep a stable identity: they are effect dependencies, and
// a fresh object per render would re-run the read forever.
const codebook = {};

vi.mock('react-redux', () => ({
  useSelector: (selector: unknown) =>
    selector === 'getAssetManifest' ? assetManifest : codebook,
}));

import useExternalData, { type ExternalDataStatus } from '../useExternalData';

const SUBJECT = { entity: 'node', type: 'person' } as const;

const makeNode = (id: string): NcNode => ({
  [entityPrimaryKeyProperty]: id,
  [entityAttributesProperty]: {},
  type: 'person',
});

type Observation = { state: ExternalDataStatus['state']; hasData: boolean };

function observe(dataSource: string) {
  const observations: Observation[] = [];

  function Probe() {
    const { externalData, status } = useExternalData(dataSource, SUBJECT);
    observations.push({
      state: status.state,
      hasData: externalData !== null,
    });
    return null;
  }

  render(<Probe />);
  return observations;
}

beforeEach(() => {
  onRequestAsset.mockReset();
  parseExternalNetworkAsset.mockReset();
});

/**
 * The states a roster or panel passes through are what its interface tells the
 * participant. Collapsing "not started" into "loaded" is how a roster came to
 * report an empty list on its first frame — a statement about the researcher's
 * data, made before anything had been read.
 */
describe('useExternalData reports where the read has got to', () => {
  it('starts idle, before the read has been attempted', () => {
    onRequestAsset.mockReturnValue(new Promise(() => undefined));

    const observations = observe('asset-1');

    expect(observations[0]).toEqual({ state: 'idle', hasData: false });
  });

  it('never claims to be ready without the data', async () => {
    const nodes = [makeNode('a'), makeNode('b')];
    onRequestAsset.mockResolvedValue('blob:roster');
    parseExternalNetworkAsset.mockResolvedValue(nodes);

    const observations = observe('asset-1');

    await waitFor(() => {
      expect(observations.at(-1)?.state).toBe('ready');
    });
    for (const observation of observations) {
      if (observation.state === 'ready') expect(observation.hasData).toBe(true);
    }
    // And it did pass through loading, so "ready" was earned rather than
    // being the initial value under another name.
    expect(observations.map((o) => o.state)).toContain('loading');
  });

  it('reports an unknown asset as an error, not as an empty list', async () => {
    const observations = observe('asset-missing');

    await waitFor(() => {
      expect(observations.at(-1)?.state).toBe('error');
    });
    expect(observations.map((o) => o.state)).not.toContain('ready');
    expect(onRequestAsset).not.toHaveBeenCalled();
  });

  it('reports a failed read as an error, not as an empty list', async () => {
    onRequestAsset.mockRejectedValue(new Error('asset unavailable'));

    const observations = observe('asset-1');

    await waitFor(() => {
      expect(observations.at(-1)?.state).toBe('error');
    });
    expect(observations.map((o) => o.state)).not.toContain('ready');
  });
});
