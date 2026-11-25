import {
  type CurrentProtocol,
  removedOptionIds,
  withoutRemovedOptionVersions,
} from '@codaco/protocol-validation';

type Codebook = CurrentProtocol['codebook'];

/**
 * The codebook's records that hold variables: the participant's, and every
 * node and edge type's.
 */
const variableOwners = (codebook: Codebook | undefined): unknown[] => [
  codebook?.ego,
  ...Object.values(codebook?.node ?? {}),
  ...Object.values(codebook?.edge ?? {}),
];

/**
 * `next` without the versions that its text writes for options that a
 * variable had in `previous` and no longer has: deleting an option, or
 * changing a variable so that it has none, takes the versions written for
 * them out of every translation in the protocol (see
 * `withoutRemovedOptionVersions`). Without this, the text would name options
 * that do not exist, and validation would refuse the whole protocol.
 *
 * A variable that `next` no longer has at all is not looked at: a variable
 * that text uses cannot be deleted (`attributeInUse`).
 */
export const withoutVersionsForRemovedOptions = <
  T extends Readonly<{ codebook?: Codebook }>,
>(
  previous: Readonly<{ codebook?: Codebook }>,
  next: T,
): T => {
  if (previous.codebook === next.codebook) return next;
  let pruned = next;
  for (const [variableId, removed] of removedOptionIds(
    variableOwners(previous.codebook),
    variableOwners(next.codebook),
  )) {
    pruned = withoutRemovedOptionVersions(pruned, variableId, removed);
  }
  return pruned;
};
