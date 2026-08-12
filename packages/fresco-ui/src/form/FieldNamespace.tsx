'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';

import type { ObjectPath } from './utils/objectPath';
import {
  isSafeContainerPath,
  isSafeObjectPath,
  parseLegacyObjectPath,
  parseObjectPath,
} from './utils/objectPath';

type FieldNamespaceState = {
  name: string;
  path: ObjectPath;
};

const emptyNamespace: FieldNamespaceState = { name: '', path: [] };
const FieldNamespaceContext =
  createContext<FieldNamespaceState>(emptyNamespace);

export type FieldNameMode = 'legacy' | 'opaque' | 'path';

export function useFieldNamespacePath(): ObjectPath {
  return useContext(FieldNamespaceContext).path;
}

export function useFieldNamespace(): string {
  return useContext(FieldNamespaceContext).name;
}

export function resolveFieldPath(
  namespace: ObjectPath,
  name: string,
  mode: FieldNameMode = 'legacy',
): ObjectPath {
  const relativePath =
    mode === 'opaque'
      ? [name]
      : mode === 'path'
        ? parseObjectPath(name)
        : parseLegacyObjectPath(name);

  const resolvedPath = relativePath
    ? [...namespace, ...relativePath]
    : undefined;

  if (!resolvedPath || !isSafeObjectPath(resolvedPath)) {
    throw new Error(`Unsafe form field path: ${name}`);
  }

  return resolvedPath;
}

type FieldNamespaceProps = {
  prefix: string;
  children: ReactNode;
};

export default function FieldNamespace({
  prefix,
  children,
}: FieldNamespaceProps) {
  const parentNamespace = useContext(FieldNamespaceContext);
  const fullNamespace = useMemo<FieldNamespaceState>(() => {
    if (parentNamespace.path.length === 0 && prefix === '') {
      return parentNamespace;
    }

    const path = resolveFieldPath(parentNamespace.path, prefix);
    if (!isSafeContainerPath(path)) {
      throw new Error(`Unsafe form field path: ${prefix}`);
    }

    return {
      name: parentNamespace.name ? `${parentNamespace.name}.${prefix}` : prefix,
      path,
    };
  }, [parentNamespace, prefix]);

  return (
    <FieldNamespaceContext.Provider value={fullNamespace}>
      {children}
    </FieldNamespaceContext.Provider>
  );
}
