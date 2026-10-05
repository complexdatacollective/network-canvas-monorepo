import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { cx } from '@codaco/fresco-ui/utils/cva';
import {
  type ExportWarningGroup,
  formatExportWarnings,
} from '@codaco/network-exporters/messages';
import type { ExportWarning } from '@codaco/network-exporters/output';

export function ExportWarningItems({
  group,
  className,
}: {
  group: ExportWarningGroup;
  className?: string;
}) {
  return (
    <ul className={cx('list-disc ps-5 text-sm', className)}>
      {group.items.map(({ key, text }) => (
        <li key={key}>{text}</li>
      ))}
    </ul>
  );
}

/** One alert for each kind of warning the export gave. */
export function ExportWarningAlerts({
  warnings,
}: {
  warnings: readonly ExportWarning[];
}) {
  const intl = useAppIntl();

  return (
    <>
      {formatExportWarnings(intl, warnings).map((group) => (
        <Alert key={group.kind} variant="warning" className="mt-4">
          <AlertTitle>{group.title}</AlertTitle>
          <AlertDescription>{group.description}</AlertDescription>
          <ExportWarningItems group={group} className="mt-2" />
        </Alert>
      ))}
    </>
  );
}
