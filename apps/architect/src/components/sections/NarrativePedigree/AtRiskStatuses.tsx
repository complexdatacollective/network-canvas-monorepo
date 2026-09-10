import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';
const messages = defineMessages({
  atRiskStatuses: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.atRiskStatuses',
    defaultMessage: 'At-risk statuses',
    description:
      'The title text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  showPossibleAtRiskStatuses: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.showPossibleAtRiskStatuses',
    defaultMessage: 'Show possible (at-risk) statuses',
    description:
      'The label text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  optionallyShowPossibleAtRiskStatusesAlongside: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.optionallyShowPossibleAtRiskStatusesAlongside',
    defaultMessage:
      'Optionally show <strong>possible</strong> (at-risk) statuses alongside the certain ones, inferred from family structure and inheritance patterns.',
    description:
      'Visible text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  whenEnabledThePedigreeAlsoShows: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.whenEnabledThePedigreeAlsoShows',
    defaultMessage:
      'When enabled, the pedigree also shows a person who <em>may develop</em> a condition or <em2>may carry</em2> it. These are drawn as the usual status symbol with a question mark (“?”) added. A solid, filled symbol always indicates a clinically <em3>affected</em3> individual (per Bennett et al., 2022 nomenclature), so at-risk relatives always appear as unfilled symbols marked with a “?”.',
    description:
      'Visible text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  howItIsCalculated: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.howItIsCalculated',
    defaultMessage: 'How it is calculated',
    description:
      'Visible text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  atRiskStatusesAreNotObservedOr: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.atRiskStatusesAreNotObservedOr',
    defaultMessage:
      'At-risk statuses are not observed or diagnosed — they are inferred from the family structure together with each condition’s inheritance pattern. For example:',
    description:
      'Visible text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  theChildOfAParentAffected: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.theChildOfAParentAffected',
    defaultMessage:
      'The child of a parent affected by a dominant condition is shown as <em>may develop</em> it.',
    description:
      'Visible text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  theChildOfTwoCarriersOf: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.theChildOfTwoCarriersOf',
    defaultMessage:
      'The child of two carriers of a recessive condition is shown as <em>may carry</em> it — or, where both parents are established carriers, <em2>may develop</em2> it.',
    description:
      'Visible text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  twoRulesConstrainHowRiskTravels: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.twoRulesConstrainHowRiskTravels',
    defaultMessage: 'Two rules constrain how risk travels through the family:',
    description:
      'Visible text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  onlyBiologicalAndDonorRelationshipsPass: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.onlyBiologicalAndDonorRelationshipsPass',
    defaultMessage:
      'Only <em>biological</em> and <em2>donor</em2> relationships pass conditions on; social, adoptive, surrogate, and partner links do not.',
    description:
      'Visible text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  whereAPersonRsquoSBiologicalSexIs: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.whereAPersonRsquoSBiologicalSexIs',
    defaultMessage:
      'Where a person’s biological sex is not known, sex-linked inheritance through that person is left uncertain rather than guessed.',
    description:
      'Visible text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  whyThisIsOffByDefault: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.whyThisIsOffByDefault',
    defaultMessage: 'Why this is off by default',
    description:
      'Visible text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
  atRiskSymbolsAreAStrongVisual: {
    id: 'architect.sections.narrativePedigree.atRiskStatuses.atRiskSymbolsAreAStrongVisual',
    defaultMessage:
      'At-risk symbols are a strong visual signal that can be read as established fact rather than inferred risk. They are intended for <strong>clinician-directed use</strong>, where the result is interpreted in context. Standard pedigree nomenclature (Bennett et al., 2022) deliberately does not encode probabilistic risk, so leave this off unless a clinician is guiding interpretation.',
    description:
      'Visible text in components / sections / NarrativePedigree / AtRiskStatuses.',
  },
});

const FIELD_NAME = 'showAtRiskStatuses';

const AtRiskStatuses = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  // Read the committed stage; `false` is the missing-value fallback only. A
  // hardcoded `false` registered the field as off no matter what the stage
  // held, and the stage saves with `overwrite: true` over `getFormValues()` —
  // so merely opening a stage that had at-risk symbols on and saving any
  // unrelated edit turned them off. (The schema defaults this to `false`, so
  // an absent key is genuinely off; only an explicit `true` is at stake.)
  const initialValue = useStageInitialValue<boolean>(FIELD_NAME) ?? false;

  return (
    <Section title={intl.formatMessage(messages.atRiskStatuses)}>
      <ArchitectField
        name={FIELD_NAME}
        component={ToggleField}
        inline
        initialValue={initialValue}
        label={intl.formatMessage(messages.showPossibleAtRiskStatuses)}
        hint={
          <Paragraph>
            {intl.formatMessage(
              messages.optionallyShowPossibleAtRiskStatusesAlongside,
              { strong: (chunks) => <strong>{chunks}</strong> },
            )}
          </Paragraph>
        }
      />
      <div className="[&_h5]:mt-5 [&_h5]:mb-1 [&_h5]:font-semibold [&_li]:mb-1 [&_p]:mb-2.5 [&_ul]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-7">
        <Paragraph>
          {intl.formatMessage(messages.whenEnabledThePedigreeAlsoShows, {
            em: (chunks) => <em>{chunks}</em>,
            em2: (chunks) => <em>{chunks}</em>,
            em3: (chunks) => <em>{chunks}</em>,
          })}
        </Paragraph>

        <h5>{intl.formatMessage(messages.howItIsCalculated)}</h5>
        <Paragraph>
          {intl.formatMessage(messages.atRiskStatusesAreNotObservedOr)}
        </Paragraph>
        <ul>
          <li>
            {intl.formatMessage(messages.theChildOfAParentAffected, {
              em: (chunks) => <em>{chunks}</em>,
            })}
          </li>
          <li>
            {intl.formatMessage(messages.theChildOfTwoCarriersOf, {
              em: (chunks) => <em>{chunks}</em>,
              em2: (chunks) => <em>{chunks}</em>,
            })}
          </li>
        </ul>
        <Paragraph>
          {intl.formatMessage(messages.twoRulesConstrainHowRiskTravels)}
        </Paragraph>
        <ul>
          <li>
            {intl.formatMessage(
              messages.onlyBiologicalAndDonorRelationshipsPass,
              {
                em: (chunks) => <em>{chunks}</em>,
                em2: (chunks) => <em>{chunks}</em>,
              },
            )}
          </li>
          <li>
            {intl.formatMessage(messages.whereAPersonRsquoSBiologicalSexIs)}
          </li>
        </ul>

        <h5>{intl.formatMessage(messages.whyThisIsOffByDefault)}</h5>
        <Paragraph>
          {intl.formatMessage(messages.atRiskSymbolsAreAStrongVisual, {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </Paragraph>
      </div>
    </Section>
  );
};
export default AtRiskStatuses;
