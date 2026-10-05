/**
 * Protocols that were upgraded in place while being opened, waiting to be
 * announced.
 *
 * A queue rather than a direct call because the upgrade happens where React
 * cannot be reached: `admitStoredProtocol` runs inside a Redux thunk on a
 * library open, and — for the session restored at launch — before React has
 * mounted at all. This is the same shape Architect already uses for the other
 * "something happened outside the tree, tell the researcher when there is a
 * tree" cases (`startupProtocolFailureQueue`, `autosaveFailureQueue`,
 * `fileLaunchQueue`): report, subscribe, take.
 */

export type ProtocolUpgradeNotice = {
  /** The library name of the protocol that was upgraded. */
  name: string;
};

let pendingUpgrades: ProtocolUpgradeNotice[] = [];
const listeners = new Set<() => void>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

export const reportProtocolUpgrade = (notice: ProtocolUpgradeNotice): void => {
  pendingUpgrades.push(notice);
  emit();
};

export const subscribeProtocolUpgrades = (
  listener: () => void,
): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const takeProtocolUpgrades = (): ProtocolUpgradeNotice[] => {
  const upgrades = pendingUpgrades;
  pendingUpgrades = [];
  return upgrades;
};
