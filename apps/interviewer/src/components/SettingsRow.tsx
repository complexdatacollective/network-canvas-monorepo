import type { ReactNode } from 'react';

import Heading from '@codaco/fresco-ui/typography/Heading';

type Props = {
  title: string;
  desc?: string;
  control: ReactNode;
};

export function SettingsRow({ title, desc, control }: Props) {
  return (
    // Container query, not a viewport breakpoint: the row stacks (title/desc on
    // top, full-width control below) when its own container is narrow and lays
    // out as two columns once it's ≥ 26rem — so it adapts to the dialog's
    // content-column width rather than the screen.
    <div className="@container px-1 py-4">
      <div className="flex flex-col gap-3 @min-[26rem]:flex-row @min-[26rem]:items-center @min-[26rem]:justify-between @min-[26rem]:gap-6">
        <div className="min-w-0">
          <Heading level="label" margin="none">
            {title}
          </Heading>
          {desc ? (
            <div className="text-text/60 mt-0.5 text-sm">{desc}</div>
          ) : null}
        </div>
        <div className="w-full @min-[26rem]:w-auto @min-[26rem]:shrink-0">
          {control}
        </div>
      </div>
    </div>
  );
}
