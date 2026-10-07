import { useCallback, useMemo } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { useStageEditorForm } from '@codaco/protocol-builder/form/stageEditorContext';
import BuilderSection from '@codaco/protocol-builder/sections/BuilderSection';
import type {
  StageFormDraft,
  StageIdentity,
} from '@codaco/protocol-builder/stageDocument';
import {
  collectLocalizedStrings,
  type LocalizedStringHit,
} from '@codaco/protocol-validation';
import { ProtocolLanguages } from '~/components/Localization/LanguageList';
import type { OpenStageDraft } from '~/components/Localization/useLanguageActions';
import {
  type LocalizedStringRewrite,
  rewriteLocalizedStrings,
} from '~/ducks/modules/protocol/localeOperations';
import type { RootState } from '~/ducks/store';
import { getProtocol } from '~/selectors/protocol';

import { useStageDraft } from './stageDraftBeacon';

const messages = defineMessages({
  title: {
    id: 'architect.stageEditor.languages.title',
    defaultMessage: 'Languages',
    description:
      'Heading of the stage editor section listing the languages a participant can choose between on a language chooser stage.',
  },
  description: {
    id: 'architect.stageEditor.languages.description',
    defaultMessage:
      '{count, plural, =1 {This protocol is written in one language, so participants will see it as their only choice. Add languages to give them more to choose from.} other {Participants choose from every language this protocol is written in.}} Changes here apply to the whole protocol, as they do on the Languages page.',
    description:
      'Description of the stage editor section listing the languages a participant can choose between. count is how many languages the protocol has. The Languages page is the page of the same name in the project navigation.',
  },
});

const NO_TEXTS: readonly LocalizedStringHit[] = [];

/**
 * Where the protocol holds the stage, or where it will once it is saved.
 * A stage still being created goes after the others.
 */
const selectStageIndex =
  (stageId: string) =>
  (state: RootState): number => {
    const stages = getProtocol(state)?.stages ?? [];
    const index = stages.findIndex((stage) => stage.id === stageId);
    return index === -1 ? stages.length : index;
  };

/** Applies a language change to the stage's fields as the protocol holds them. */
const rewriteStageFields = (
  identity: StageIdentity,
  fields: StageFormDraft,
  change: LocalizedStringRewrite,
): StageFormDraft => {
  const document = { stages: [{ ...fields, type: identity.type }] };
  const rewritten = rewriteLocalizedStrings(document, change);
  const [stage] = rewritten.stages;
  if (rewritten === document || stage === undefined) return fields;
  const { type: _type, ...rewrittenFields } = stage;
  return rewrittenFields;
};

/**
 * The protocol's languages, on the stage where participants choose between
 * them, with the same changes the Languages page makes.
 *
 * The stage open here is the one stage whose text is not all in the protocol,
 * so its unsaved text counts when a removal is checked, and a removal or a
 * change of language rewrites it as it rewrites the protocol.
 */
export default function StageLanguagesSection() {
  const intl = useAppIntl();
  const { identity, mapDocuments } = useStageEditorForm();
  const languageCount = useSelector(
    (state: RootState) => getProtocol(state)?.localization.locales.length ?? 0,
  );
  const stage = useStageDraft((beacon) => beacon.stage);
  const stageIndex = useSelector(selectStageIndex(identity.id));

  // At the paths the protocol holds the stage at, so a text the protocol
  // already has counts once.
  const texts = useMemo(
    () =>
      stage === undefined
        ? NO_TEXTS
        : collectLocalizedStrings({ stages: [stage] }).map((hit) => ({
            ...hit,
            path: ['stages', stageIndex, ...hit.path.slice(2)],
          })),
    [stage, stageIndex],
  );

  const rewrite = useCallback(
    (change: LocalizedStringRewrite) => {
      mapDocuments((fields) => rewriteStageFields(identity, fields, change));
    },
    [identity, mapDocuments],
  );

  const draft = useMemo<OpenStageDraft>(
    () => ({ texts, rewrite }),
    [rewrite, texts],
  );

  return (
    <BuilderSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description, {
        count: languageCount,
      })}
    >
      <ProtocolLanguages draft={draft} />
    </BuilderSection>
  );
}
