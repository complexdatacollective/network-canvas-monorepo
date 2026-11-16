import type { ReactNode } from 'react';

import { useOptionalProtocolBuilderContext } from '../state/context.ts';
import { useNodeShapeSvgs } from './useNodeShapeSvgs.ts';

type NodeShapeSvgsProps = Readonly<{
  assets: readonly string[];
  children: (shapeSvgs: Readonly<Record<string, string>>) => ReactNode;
}>;

const NO_SVGS: Readonly<Record<string, string>> = Object.freeze({});

function HostedNodeShapeSvgs({ assets, children }: NodeShapeSvgsProps) {
  return children(useNodeShapeSvgs(assets));
}

/**
 * `useNodeShapeSvgs` for a component that may be drawn outside a
 * `ProtocolBuilder`. There nothing is read, and every custom shape falls back
 * to a built-in one.
 */
export default function NodeShapeSvgs({
  assets,
  children,
}: NodeShapeSvgsProps) {
  return useOptionalProtocolBuilderContext() === undefined ? (
    children(NO_SVGS)
  ) : (
    <HostedNodeShapeSvgs assets={assets}>{children}</HostedNodeShapeSvgs>
  );
}
