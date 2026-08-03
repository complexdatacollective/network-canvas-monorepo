'use client';

import { Pattern } from '@codaco/art';

export function ProtocolPattern({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return <Pattern aria-hidden seed={name} className={className} />;
}
