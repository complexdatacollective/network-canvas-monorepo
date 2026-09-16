import { useAppIntl } from '@codaco/app-i18n/react';
import type { StageType } from '@codaco/protocol-validation';

import { useStageEditorForm } from '../form/stageEditorContext.ts';
import { stageTypeDocumentationUrl } from './documentation.ts';
import { interfaceDisplayName } from './interfaceNames.ts';

export type StageTypeInfo = Readonly<{
  /**
   * The interface the open stage is edited by.
   *
   * What `interfaces/StageTypeImage` draws a picture of, and the key every
   * other fact about the kind of stage this is hangs off.
   */
  stageType: StageType;
  /** What the interface is called, in the reader's language. */
  interfaceName: string;
  /** Where a researcher reads about this interface. */
  documentationUrl: string;
}>;

/**
 * What kind of stage is open, as data rather than as a badge and a link.
 *
 * The package knows which interface a stage uses, what it is called in the
 * reader's language and where it is documented; whether any of that is on
 * screen is the host's decision. Architect draws all three around the stage's
 * name — a picture of the interface, a badge naming it, and a link to its
 * page — and a host whose editor is reached from a list that already says
 * which interface it is draws none of them.
 */
export function useStageTypeInfo(): StageTypeInfo {
  const { identity } = useStageEditorForm();
  const intl = useAppIntl();

  return {
    stageType: identity.type,
    // The identifier itself for an interface this build has no name for, which
    // is the same fallback the stage-type image makes: an imported protocol
    // may name a stage type from a newer version.
    interfaceName: interfaceDisplayName(identity.type, intl) ?? identity.type,
    documentationUrl: stageTypeDocumentationUrl(identity.type),
  };
}
