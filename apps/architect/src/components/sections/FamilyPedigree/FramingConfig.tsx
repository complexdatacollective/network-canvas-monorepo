import {
  defineMessages,
  type MessageDescriptor,
} from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import RadioGroupField from '@codaco/fresco-ui/form/fields/RadioGroup';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { FRAMING_IDS, type FramingId } from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import { formatConfig } from '~/i18n/formatConfig';
const configMessages = defineMessages({
  fixedFraming: {
    id: 'architect.sections.familyPedigree.framingConfig.config.fixedFraming',
    defaultMessage: 'Fixed framing',
    description:
      'Presentation label or description in components/sections/FamilyPedigree/FramingConfig.tsx. Identifiers are not translated.',
  },
  letTheParticipantChoose: {
    id: 'architect.sections.familyPedigree.framingConfig.config.letTheParticipantChoose',
    defaultMessage: 'Let the participant choose',
    description:
      'Presentation label or description in components/sections/FamilyPedigree/FramingConfig.tsx. Identifiers are not translated.',
  },
});
const messages = defineMessages({
  pedigreeFraming: {
    id: 'architect.sections.familyPedigree.framingConfig.pedigreeFraming',
    defaultMessage: 'Pedigree framing',
    description:
      'The title text in components / sections / FamilyPedigree / FramingConfig.',
  },
  chooseFixedTerminologyOrLetEach: {
    id: 'architect.sections.familyPedigree.framingConfig.chooseFixedTerminologyOrLetEach',
    defaultMessage:
      'Choose fixed terminology or let each participant select their preferred framing.',
    description:
      'The description text in components / sections / FamilyPedigree / FramingConfig.',
  },
  theFramingDeterminesTheLanguageThe: {
    id: 'architect.sections.familyPedigree.framingConfig.theFramingDeterminesTheLanguageThe',
    defaultMessage:
      'The framing determines the language the interface uses when talking about biological parents:',
    description:
      'Visible text in components / sections / FamilyPedigree / FramingConfig.',
  },
  gameteBasedDescribesEachParent: {
    id: 'architect.sections.familyPedigree.framingConfig.gameteBasedDescribesEachParent',
    defaultMessage:
      '<strong>Gamete-based</strong> — describes each parent by their reproductive contribution, using terms such as “egg parent” and “sperm parent” and questions such as “Who provided the egg?”. This framing works for all family structures, including donor conception, surrogacy, and same-sex parents.',
    description:
      'Visible text in components / sections / FamilyPedigree / FramingConfig.',
  },
  genderedUsesGenderedKinship: {
    id: 'architect.sections.familyPedigree.framingConfig.genderedUsesGenderedKinship',
    defaultMessage:
      '<strong>Gendered</strong> — uses gendered kinship terms such as “mother” and “father” and questions such as “Who is the biological mother?”. This framing assumes that each child has a mother and a father.',
    description:
      'Visible text in components / sections / FamilyPedigree / FramingConfig.',
  },
  bothFramingsUseTheSameWording: {
    id: 'architect.sections.familyPedigree.framingConfig.bothFramingsUseTheSameWording',
    defaultMessage:
      'Both framings use the same wording for gestational carriers and donors.',
    description:
      'Visible text in components / sections / FamilyPedigree / FramingConfig.',
  },
  framingMode: {
    id: 'architect.sections.familyPedigree.framingConfig.framingMode',
    defaultMessage: 'Framing mode',
    description:
      'The label text in components / sections / FamilyPedigree / FramingConfig.',
  },
  fixedFramingTerminology: {
    id: 'architect.sections.familyPedigree.framingConfig.fixedFramingTerminology',
    defaultMessage: 'Fixed framing terminology',
    description:
      'The label text in components / sections / FamilyPedigree / FramingConfig.',
  },
});

const FRAMING_MODE_OPTIONS = [
  { value: 'fixed', label: configMessages.fixedFraming },
  { value: 'participantChoice', label: configMessages.letTheParticipantChoose },
];

/**
 * Author-facing names for each framing. The framing ids are schema contract
 * (`@codaco/protocol-validation`); these labels are editor copy, so they live
 * with the editor that shows them. The participant-facing terminology each
 * framing selects lives in the interview runtime.
 */
const FRAMING_AUTHOR_LABELS = defineMessages({
  gamete: {
    id: 'architect.sections.familyPedigree.framingConfig.gamete',
    defaultMessage: 'Gamete-based',
    description:
      'Researcher option: biological parent terminology based on reproductive contribution. The persisted framing identifier remains gamete.',
  },
  gendered: {
    id: 'architect.sections.familyPedigree.framingConfig.gendered',
    defaultMessage: 'Gendered',
    description:
      'Researcher option: biological parent terminology using mother and father. The persisted framing identifier remains gendered.',
  },
}) satisfies Record<FramingId, MessageDescriptor>;

const FRAMING_VALUE_OPTIONS = FRAMING_IDS.map((value) => ({
  value,
  label: FRAMING_AUTHOR_LABELS[value],
}));

const FramingConfig = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  // `framing.value` only ever registers while the mode field is 'fixed' (it is
  // conditionally rendered below), so its dormant value drops out of
  // getFormValues() the moment the mode switches away — the discriminated
  // union's `participantChoice` variant carries no `value` key, matching the
  // schema without an explicit clear.
  const mode = useStageFormValue<string>('framing.mode') ?? 'fixed';
  const modeInitial = useStageInitialValue<string>('framing.mode');
  const valueInitial = useStageInitialValue<string>('framing.value');

  return (
    <Section
      title={intl.formatMessage(messages.pedigreeFraming)}
      description={intl.formatMessage(messages.chooseFixedTerminologyOrLetEach)}
    >
      <Paragraph>
        {intl.formatMessage(messages.theFramingDeterminesTheLanguageThe)}
      </Paragraph>
      <ul className="mb-5 list-disc pl-7 [&_li]:mb-1">
        <li>
          {intl.formatMessage(messages.gameteBasedDescribesEachParent, {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </li>
        <li>
          {intl.formatMessage(messages.genderedUsesGenderedKinship, {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </li>
      </ul>
      <Paragraph className="mb-5">
        {intl.formatMessage(messages.bothFramingsUseTheSameWording)}
      </Paragraph>
      <ArchitectField
        name="framing.mode"
        component={RadioGroupField}
        label={intl.formatMessage(messages.framingMode)}
        initialValue={modeInitial}
        options={formatConfig(FRAMING_MODE_OPTIONS, intl)}
      />

      {mode === 'fixed' && (
        <div className="mt-5">
          <ArchitectField
            name="framing.value"
            component={NativeSelectField}
            label={intl.formatMessage(messages.fixedFramingTerminology)}
            // Falls back to the canonical default so switching from
            // participantChoice to fixed always registers a valid value —
            // the enhancer's old `handleModeChange` default.
            initialValue={valueInitial ?? 'gamete'}
            options={formatConfig(FRAMING_VALUE_OPTIONS, intl)}
          />
        </div>
      )}
    </Section>
  );
};
export default FramingConfig;
