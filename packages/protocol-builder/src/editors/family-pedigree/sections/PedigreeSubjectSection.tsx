import { useMemo } from 'react';

import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';

import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useLocalizedText } from '../../../localization/ProtocolLocalization.tsx';
import SubjectSection from '../../../sections/subject-picker/SubjectSection.tsx';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import { familyPedigreeMessages as messages } from './pedigreeMessages.ts';

/**
 * The node type family members are, which may not change while a narrative
 * pedigree reads this stage.
 *
 * A narrative pedigree resolves every disease it draws through THIS stage's
 * subject, so a change here leaves it naming attributes the new type does not
 * have — a protocol whole-protocol validation refuses, and one this editor
 * cannot repair, because the stage that has to be remapped is not the stage it
 * is editing. So the change is refused, with the stages that stand in its way
 * named, rather than confirmed.
 */
export default function PedigreeSubjectSection() {
  const intl = useAppIntl();
  const localize = useLocalizedText();
  const protocolContext = useProtocolContext();
  const { identity } = useStageEditorForm();

  const dependentStages = useMemo(
    () =>
      protocolContext.orderedStages.filter(
        (stage) =>
          stage.type === 'NarrativePedigree' &&
          stage.sourceStageId === identity.id,
      ),
    [identity.id, protocolContext.orderedStages],
  );

  if (dependentStages.length === 0) return <SubjectSection entity="node" />;

  // The stage names reach both sentences as ONE value, joined by the reader's
  // own list formatter: which separator a list of names takes, and whether the
  // last one is introduced by a word at all, is a fact about the reader's
  // language.
  const stageNames = intl.formatList(
    dependentStages.map((stage) => `"${localize(stage.label).text}"`),
    { type: 'conjunction' },
  );

  return (
    <SubjectSection
      entity="node"
      blockChangeReason={intl.formatMessage(
        messages.dependentStagesBlockReason,
        { stageCount: dependentStages.length, stageNames },
      )}
      notice={
        <Alert variant="warning">
          <AlertTitle>
            {intl.formatMessage(messages.dependentStagesTitle)}
          </AlertTitle>
          <AlertDescription>
            {intl.formatMessage(messages.dependentStagesDescription, {
              stageNames,
            })}
          </AlertDescription>
        </Alert>
      }
    />
  );
}
