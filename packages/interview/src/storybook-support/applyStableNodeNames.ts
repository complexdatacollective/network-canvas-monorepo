import type { SyntheticInterview } from '@codaco/protocol-utilities';

const STABLE_NODE_NAMES = [
  'Alex',
  'Blair',
  'Casey',
  'Devon',
  'Ellis',
  'Frankie',
  'Gray',
  'Hayden',
  'Indigo',
  'Jules',
  'Kai',
  'Logan',
  'Morgan',
  'Nico',
  'Oakley',
  'Parker',
  'Quinn',
  'Riley',
  'Sage',
  'Taylor',
] as const;

/**
 * Pin synthetic node labels so Storybook snapshots do not depend on Faker's
 * generated-name sequence, which can change when Faker is upgraded.
 */
export default function applyStableNodeNames(
  interview: SyntheticInterview,
  nameVariableId: string,
): SyntheticInterview {
  interview.getNodeEntries().forEach((_, index) => {
    interview.setNodeAttribute(
      index,
      nameVariableId,
      STABLE_NODE_NAMES[index] ?? `Person ${index + 1}`,
    );
  });

  return interview;
}
