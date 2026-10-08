import { createSelector, createSlice } from '@reduxjs/toolkit';

import type { ProtocolPayload } from '../../contract/types';

type ProtocolState = ProtocolPayload;

const initialState = {} as ProtocolState;

const protocolSlice = createSlice({
  name: 'protocol',
  initialState,
  reducers: {},
  selectors: {
    getCodebook: (state) => state.codebook,
    getProtocolLocalization: (state) => state.localization,
    // The protocol's stages, finish stages included: the interview adds no
    // stage of its own.
    getStages: createSelector(
      [(state: ProtocolState) => state.stages],
      (stages) => stages ?? [],
    ),
    getAssetManifest: createSelector(
      [(state: ProtocolState) => state.assets],
      (assets) =>
        assets ? Object.fromEntries(assets.map((a) => [a.assetId, a])) : {},
    ),
  },
});

// export selectors
export const {
  getCodebook,
  getProtocolLocalization,
  getStages,
  getAssetManifest,
} = protocolSlice.selectors;

export default protocolSlice.reducer;
