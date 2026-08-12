'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';

import type { ObjectPath } from './utils/objectPath';
import {
  formatObjectPath,
  isSafeObjectPath,
  parseObjectPath,
} from './utils/objectPath';

const emptyNamespace: ObjectPath = [];
const FieldNamespaceContext = createContext<ObjectPath>(emptyNamespace);

export type FieldNameMode = 'opaque' | 'path';

export function useFieldNamespacePath(): ObjectPath {
  return useContext(FieldNamespaceContext);
}

export function useFieldNamespace(): string {
  return formatObjectPath(useFieldNamespacePath());
}

export function resolveFieldPath(
  namespace: ObjectPath,
  name: string,
  mode: FieldNameMode = 'path',
): ObjectPath {
  const relativePath = mode === 'opaque' ? [name] : parseObjectPath(name);

  if (!relativePath || !isSafeObjectPath(relativePath)) {
    throw new Error(`Unsafe form field path: ${name}`);
  }

  return [...namespace, ...relativePath];
}

type FieldNamespaceProps = {
  prefix: string;
  children: ReactNode;
};

export default function FieldNamespace({
  prefix,
  children,
}: FieldNamespaceProps) {
  const parentNamespace = useFieldNamespacePath();
  const fullNamespace = useMemo(
    () => resolveFieldPath(parentNamespace, prefix),
    [parentNamespace, prefix],
  );

  return (
    <FieldNamespaceContext.Provider value={fullNamespace}>
      {children}
    </FieldNamespaceContext.Provider>
  );
}
