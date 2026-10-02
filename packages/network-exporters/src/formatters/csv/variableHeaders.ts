import type { Variable } from '@codaco/protocol-validation';
import { variableExportColumns } from '@codaco/shared-consts';

import type { ExportOptions } from '../../options';

export const addVariableHeaders = (
  headers: Set<string>,
  variables: Record<string, Variable> | undefined,
  exportOptions: ExportOptions,
) => {
  for (const variable of Object.values(variables ?? {})) {
    for (const column of variableExportColumns(variable, {
      format: 'csv',
      useScreenLayoutCoordinates:
        exportOptions.globalOptions.useScreenLayoutCoordinates,
    })) {
      headers.add(column);
    }
  }
};
