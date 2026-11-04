import type { icons } from 'lucide-react';
import dynamicIconImports from 'lucide-react/dynamicIconImports';

import { lucideAliasNames } from './lucideAliasNames';

export type LucideIconName = keyof typeof icons;

type LucideIconSource = {
  fileName: string;
  load: (typeof dynamicIconImports)[keyof typeof dynamicIconImports];
};

/** Lucide's own rule for naming an icon's export after its file. */
export function toLucidePascalCase(fileName: string) {
  let out = '';
  let upperNext = false;
  for (const ch of fileName) {
    if (ch === '-' || ch === '_' || ch <= ' ') {
      upperNext = out.length > 0;
      continue;
    }
    if (out.length === 0) {
      out += ch.toUpperCase();
    } else {
      out += upperNext ? ch.toUpperCase() : ch;
    }
    upperNext = false;
  }
  return out;
}

const lucideIconSources = new Map<string, LucideIconSource>();
for (const [fileName, load] of Object.entries(dynamicIconImports)) {
  if (!lucideAliasNames.has(fileName)) {
    lucideIconSources.set(toLucidePascalCase(fileName), { fileName, load });
  }
}

export function isLucideIconName(name: string): name is LucideIconName {
  return lucideIconSources.has(name);
}

export function getLucideIconSource(name: LucideIconName) {
  const source = lucideIconSources.get(name);
  if (source === undefined) {
    throw new Error(`Unknown Lucide icon: ${name}`);
  }
  return source;
}

export function getLucideIconNames() {
  return [...lucideIconSources.keys()];
}
