'use client';

import type { ExportWarningGroup } from '@codaco/network-exporters/messages';

type ExportWarningToastContentProps = {
  group: ExportWarningGroup;
};

export default function ExportWarningToastContent({
  group,
}: ExportWarningToastContentProps) {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>{group.description}</p>
      <ul className="list-disc ps-5">
        {group.items.map(({ key, text }) => (
          <li key={key}>{text}</li>
        ))}
      </ul>
    </div>
  );
}
