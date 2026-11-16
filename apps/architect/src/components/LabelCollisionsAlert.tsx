import { Link } from 'wouter';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import { Alert, AlertDescription, AlertTitle } from '@codaco/fresco-ui/Alert';
import { NativeLink } from '@codaco/fresco-ui/NativeLink';
import { getMarkdownLabelText } from '@codaco/fresco-ui/RenderMarkdown';
import type {
  CurrentProtocol,
  LabelCollision,
} from '@codaco/protocol-validation';
import { codebookHref } from '~/components/Codebook/codebookLinks';
import { useAppSelector } from '~/ducks/hooks';
import { getLabelCollisions } from '~/selectors/issues';
import { getProtocol } from '~/selectors/protocol';
import { resolveLocalizedText } from '~/utils/localizedText';

import { translationTableHref } from './Localization/translationTableLinks';
import { useLanguageName } from './Localization/useLanguageName';

const messages = defineMessages({
  title: {
    id: 'architect.labelCollisions.title',
    defaultMessage: 'Some labels are the same',
    description:
      'Title of the warning on the stage list shown while two answer options of one attribute, or two diseases of a Narrative Pedigree stage, have the same label in one of the protocol’s languages: a participant would see the same text, perhaps differing only in capital letters or spaces at either end. Researcher-facing.',
  },
  description: {
    id: 'architect.labelCollisions.description',
    defaultMessage:
      'Participants could not tell these apart. The protocol can’t be downloaded until each pair has different labels.',
    description:
      'Shown under the title of the warning about labels that are the same, above the list of pairs. “These” and “each pair” are the pairs of answer options or diseases listed below it. Researcher-facing.',
  },
  optionPair: {
    id: 'architect.labelCollisions.optionPair',
    defaultMessage:
      'Options {first, number} and {second, number} of the attribute “{attribute}” have the same label in {language}: “{firstLabel}” and “{secondLabel}”.',
    description:
      'One item in the warning about labels that are the same: two answer options of one attribute (a question in the codebook with a fixed list of answers) whose labels a participant reading the language would see as the same text. first and second are the options’ positions in the attribute’s list, counting from 1. attribute is the attribute’s name. language is the name of the language, for example “Spanish”. firstLabel and secondLabel are the two labels as a participant reads them in that language; they may differ only in capital letters or spaces.',
  },
  diseasePair: {
    id: 'architect.labelCollisions.diseasePair',
    defaultMessage:
      'Diseases {first, number} and {second, number} of the stage “{stage}” have the same label in {language}: “{firstLabel}” and “{secondLabel}”.',
    description:
      'One item in the warning about labels that are the same: two diseases (conditions a participant reports for their family members) of a Narrative Pedigree stage whose labels a participant reading the language would see as the same text. first and second are the diseases’ positions in the stage’s list, counting from 1. stage is the stage’s name. language is the name of the language, for example “Spanish”. firstLabel and secondLabel are the two labels as a participant reads them in that language; they may differ only in capital letters or spaces.',
  },
  editAttribute: {
    id: 'architect.labelCollisions.editAttribute',
    defaultMessage: 'Edit the attribute “{attribute}”',
    description:
      'Link after an item in the warning about labels that are the same, when the two options have the same label in the protocol’s default language. It opens the codebook editor where the attribute’s options are edited. attribute is the attribute’s name.',
  },
  editStage: {
    id: 'architect.labelCollisions.editStage',
    defaultMessage: 'Edit the stage “{stage}”',
    description:
      'Link after an item in the warning about labels that are the same, when the two diseases have the same label in the protocol’s default language. It opens the editor of the stage the diseases belong to. stage is the stage’s name.',
  },
  translate: {
    id: 'architect.labelCollisions.translate',
    defaultMessage: 'Edit the translations into {language}',
    description:
      'Link after an item in the warning about labels that are the same, when the two labels are the same only in a language other than the protocol’s default language, often because one of them has no translation into it. It opens the translation table showing that language beside the default one. language is the name of that language, for example “Spanish”.',
  },
});

/** Where the pair is fixed: the editor that owns them, or the translations. */
const fixHref = (protocol: CurrentProtocol, collision: LabelCollision) => {
  const { locale } = collision.duplicate;
  if (locale !== protocol.localization.defaultLocale) {
    return translationTableHref({ kind: 'all' }, locale);
  }
  if (collision.kind === 'disease') {
    return `/protocol/stage/${collision.stageId}`;
  }
  return collision.subject.entity === 'ego'
    ? codebookHref()
    : codebookHref({
        entity: collision.subject.entity,
        type: collision.subject.type,
      });
};

/**
 * Stage-list warning naming each pair of labels a participant chooses between
 * that reads the same in some language, with a link to where it is fixed. A
 * change of the protocol's languages can leave such a pair through fallback;
 * the change is made, and this says what it left. The protocol can still be
 * edited and saved, but not downloaded, so the warning cannot be dismissed.
 * Renders nothing when there is no such pair.
 */
const LabelCollisionsAlert = () => {
  const intl = useAppIntl();
  const languageName = useLanguageName();
  const collisions = useAppSelector(getLabelCollisions);
  const protocol = useAppSelector(getProtocol);

  if (protocol === null || collisions.length === 0) return null;

  const stageName = (stageIndex: number) =>
    resolveLocalizedText(
      protocol.stages[stageIndex]?.label,
      protocol.localization,
    )?.text ?? '';

  return (
    <Alert variant="warning">
      <AlertTitle>{intl.formatMessage(messages.title)}</AlertTitle>
      <AlertDescription className="space-y-4 text-sm">
        <span className="block">
          {intl.formatMessage(messages.description)}
        </span>
        <ul className="list-disc space-y-2 ps-5">
          {collisions.map((collision) => {
            const { duplicate } = collision;
            const language = languageName(duplicate.locale);
            const isDefault =
              duplicate.locale === protocol.localization.defaultLocale;
            const labels =
              collision.kind === 'option'
                ? {
                    firstLabel: getMarkdownLabelText(duplicate.firstText),
                    secondLabel: getMarkdownLabelText(duplicate.text),
                  }
                : {
                    firstLabel: duplicate.firstText,
                    secondLabel: duplicate.text,
                  };
            const pair = {
              first: duplicate.firstIndex + 1,
              second: duplicate.index + 1,
              language,
              ...labels,
            };
            const stage =
              collision.kind === 'disease'
                ? stageName(collision.stageIndex)
                : '';
            return (
              <li key={JSON.stringify([collision.paths, duplicate.locale])}>
                <span className="block">
                  {collision.kind === 'option'
                    ? intl.formatMessage(messages.optionPair, {
                        ...pair,
                        attribute: collision.variableName,
                      })
                    : intl.formatMessage(messages.diseasePair, {
                        ...pair,
                        stage,
                      })}
                </span>
                <NativeLink
                  render={<Link href={fixHref(protocol, collision)} />}
                >
                  {!isDefault
                    ? intl.formatMessage(messages.translate, { language })
                    : collision.kind === 'option'
                      ? intl.formatMessage(messages.editAttribute, {
                          attribute: collision.variableName,
                        })
                      : intl.formatMessage(messages.editStage, { stage })}
                </NativeLink>
              </li>
            );
          })}
        </ul>
      </AlertDescription>
    </Alert>
  );
};

export default LabelCollisionsAlert;
