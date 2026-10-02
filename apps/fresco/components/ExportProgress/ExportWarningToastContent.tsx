'use client';

import { useAppIntl } from '@codaco/app-i18n/react';
import {
  exportWarningMessages,
  formatXmlCharacterWarnings,
} from '@codaco/network-exporters/messages';
import type { ExportWarning } from '@codaco/network-exporters/output';

type ExportWarningToastContentProps = {
  warnings: readonly ExportWarning[];
};

export default function ExportWarningToastContent({
  warnings,
}: ExportWarningToastContentProps) {
  const intl = useAppIntl();

  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        {intl.formatMessage(exportWarningMessages.xmlCharactersDescription)}
      </p>
      <ul className="list-disc ps-5">
        {formatXmlCharacterWarnings(intl, warnings).map((line, index) => (
          <li key={warnings[index]?.sessionId}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
