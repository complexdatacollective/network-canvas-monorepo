import { useAppIntl } from '@codaco/app-i18n/react';
import type { StageType } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { stageTypeDocumentationUrl } from './documentation.ts';
import { interfaceDisplayName } from './interfaceNames.ts';

export type StageTypeInfo = Readonly<{
  /** The interface the open stage is edited by. */
  stageType: StageType;
  /** What the interface is called, in the reader's language. */
  interfaceName: string;
  /** Where a researcher reads about this interface. */
  documentationUrl: string;
}>;

/**
 * What kind of stage is open, as data rather than as a badge and a link:
 * whether any of it is on screen is the host's decision.
 */
export function useStageTypeInfo(): StageTypeInfo {
  const { identity } = useStageEditorForm();
  const intl = useAppIntl();

  return {
    stageType: identity.type,
    // The identifier itself for an interface this build has no name for: an
    // imported protocol may name a stage type from a newer version.
    interfaceName: interfaceDisplayName(identity.type, intl) ?? identity.type,
    documentationUrl: stageTypeDocumentationUrl(identity.type),
  };
}
