import type { CurrentProtocol } from '@codaco/protocol-validation';

import { developmentProtocol } from '../development-protocol';

/**
 * A layout that these fixtures add to the development protocol and that no
 * stage places nodes in.
 */
export const SHOWN_ONLY_LAYOUT = {
  id: '5b0c1d2e-3f40-4a51-8b62-7c83d94e0f15',
  name: 'shownOnlyLayout',
};

const layoutNamed = (protocol: CurrentProtocol, name: string) => {
  const entry = Object.entries(protocol.codebook.layouts ?? {}).find(
    ([, layout]) => layout.name === name,
  );
  if (!entry) throw new Error(`The protocol has no layout "${name}".`);
  return entry[0];
};

const narrativeOf = (protocol: CurrentProtocol) => {
  const narrative = protocol.stages.find((stage) => stage.type === 'Narrative');
  if (narrative?.type !== 'Narrative') {
    throw new Error('The protocol has no Narrative.');
  }
  return narrative;
};

/**
 * The development protocol with every preset of its Narrative showing
 * closenessLayout, in which its first Sociogram and its Network Composer
 * place people, and with `SHOWN_ONLY_LAYOUT` in the codebook, unused. No
 * stage shows a layout that has no positions for its nodes.
 */
export const protocolWithReachableLayouts = (): CurrentProtocol => {
  const protocol = structuredClone(developmentProtocol);
  const closeness = layoutNamed(protocol, 'closenessLayout');
  for (const preset of narrativeOf(protocol).presets) {
    preset.layout = closeness;
  }
  protocol.codebook.layouts = {
    ...protocol.codebook.layouts,
    [SHOWN_ONLY_LAYOUT.id]: { name: SHOWN_ONLY_LAYOUT.name },
  };
  return protocol;
};

/**
 * `protocolWithReachableLayouts` with the last `presets` presets of its
 * Narrative showing `SHOWN_ONLY_LAYOUT`, so the Narrative shows a layout in
 * which no stage places people. Returns the Narrative's id and the ids of
 * the presets that show it.
 */
export const protocolShowingUnplacedLayout = (presets = 1) => {
  const protocol = protocolWithReachableLayouts();
  const narrative = narrativeOf(protocol);
  if (narrative.presets.length < presets) {
    throw new Error(`The Narrative has fewer than ${presets} presets.`);
  }
  const reading = narrative.presets.slice(-presets);
  for (const preset of reading) {
    preset.layout = SHOWN_ONLY_LAYOUT.id;
  }
  return {
    protocol,
    narrativeId: narrative.id,
    presetIds: reading.map((preset) => preset.id),
  };
};
