'use client';

import {
  Icon as LucideIconBase,
  type LucideIconData,
  type LucideProps,
} from 'lucide-react';
import { useEffect, useSyncExternalStore } from 'react';

import { getLucideIconSource, type LucideIconName } from './lucideIconNames';

const loadedIcons = new Map<LucideIconName, LucideIconData>();
const pendingIcons = new Set<LucideIconName>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function loadIcon(name: LucideIconName) {
  if (loadedIcons.has(name) || pendingIcons.has(name)) return;

  pendingIcons.add(name);
  try {
    const module = await getLucideIconSource(name).load();
    loadedIcons.set(name, module.__iconData);
    for (const listener of listeners) listener();
  } finally {
    pendingIcons.delete(name);
  }
}

const getServerSnapshot = () => undefined;

type LucideIconProps = {
  name: LucideIconName;
} & LucideProps;

/**
 * Loads the named icon's own chunk on first use. Until it arrives, renders
 * the same empty `svg` box the icon will fill, so nothing around it moves.
 */
export default function LucideIcon({ name, ...props }: LucideIconProps) {
  const iconData = useSyncExternalStore(
    subscribe,
    () => loadedIcons.get(name),
    getServerSnapshot,
  );

  useEffect(() => {
    void loadIcon(name);
  }, [name]);

  return (
    <LucideIconBase
      icon={iconData ?? { name: getLucideIconSource(name).fileName, node: [] }}
      {...props}
    />
  );
}
