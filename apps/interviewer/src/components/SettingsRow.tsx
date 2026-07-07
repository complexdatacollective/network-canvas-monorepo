import type { ReactNode } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';

type Props = {
  title: string;
  desc?: string;
  control: ReactNode;
};

export function SettingsRow({ title, desc, control }: Props) {
  return (
    <div className="flex items-center justify-between gap-6 px-1 py-4">
      <div className="min-w-0">
        <Heading level="label" margin="none">
          {title}
        </Heading>
        {desc ? (
          <div className="text-text/60 mt-0.5 text-sm">{desc}</div>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}
