import { TriangleAlert } from 'lucide-react';
import { useCallback } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { useToast } from '@codaco/fresco-ui/Toast';
import { formatExportWarnings } from '@codaco/network-exporters/messages';
import type { ExportWarning } from '@codaco/network-exporters/output';

import { ExportWarningItems } from './ExportWarnings';

/**
 * Raises one toast for each kind of warning an export gave. Each stays until
 * it is dismissed, so the warnings outlast the export dialog that showed them.
 */
export function useShowExportWarnings() {
  const intl = useAppIntl();
  const { add } = useToast();

  return useCallback(
    (warnings: readonly ExportWarning[]) => {
      for (const group of formatExportWarnings(intl, warnings)) {
        add({
          title: group.title,
          description: (
            <div className="flex flex-col gap-2 text-sm">
              <p>{group.description}</p>
              <ExportWarningItems group={group} />
            </div>
          ),
          icon: <TriangleAlert className="size-5" aria-hidden />,
          timeout: 0,
        });
      }
    },
    [add, intl],
  );
}
