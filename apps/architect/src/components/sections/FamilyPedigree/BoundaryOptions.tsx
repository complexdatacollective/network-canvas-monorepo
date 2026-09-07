import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Section from '@codaco/fresco-ui/Section';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import ArchitectField from '~/components/Form/ArchitectField';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';
import { formatConfig } from '~/i18n/formatConfig';
const configMessages = defineMessages({
  required: {
    id: 'architect.sections.familyPedigree.boundaryOptions.config.required',
    defaultMessage: 'Required',
    description:
      'Presentation label or description in components/sections/FamilyPedigree/BoundaryOptions.tsx. Identifiers are not translated.',
  },
  recommended: {
    id: 'architect.sections.familyPedigree.boundaryOptions.config.recommended',
    defaultMessage: 'Recommended',
    description:
      'Presentation label or description in components/sections/FamilyPedigree/BoundaryOptions.tsx. Identifiers are not translated.',
  },
  off: {
    id: 'architect.sections.familyPedigree.boundaryOptions.config.off',
    defaultMessage: 'Off',
    description:
      'Presentation label or description in components/sections/FamilyPedigree/BoundaryOptions.tsx. Identifiers are not translated.',
  },
});
const messages = defineMessages({
  pedigreeBoundaries: {
    id: 'architect.sections.familyPedigree.boundaryOptions.pedigreeBoundaries',
    defaultMessage: 'Pedigree boundaries',
    description:
      'The title text in components / sections / FamilyPedigree / BoundaryOptions.',
  },
  setHowFarThePedigreeMust: {
    id: 'architect.sections.familyPedigree.boundaryOptions.setHowFarThePedigreeMust',
    defaultMessage:
      "Set how far the pedigree must extend beyond the participant's immediate family.",
    description:
      'The description text in components / sections / FamilyPedigree / BoundaryOptions.',
  },
  eachBoundaryBelowCanBeSet: {
    id: 'architect.sections.familyPedigree.boundaryOptions.eachBoundaryBelowCanBeSet',
    defaultMessage:
      'Each boundary below can be set to one of three enforcement levels, which determine how the interview behaves when the condition is not yet met:',
    description:
      'Visible text in components / sections / FamilyPedigree / BoundaryOptions.',
  },
  offTheConditionIs: {
    id: 'architect.sections.familyPedigree.boundaryOptions.offTheConditionIs',
    defaultMessage:
      '<strong>Off</strong> — the condition is never checked, and participants are not asked to provide this information.',
    description:
      'Visible text in components / sections / FamilyPedigree / BoundaryOptions.',
  },
  recommendedParticipantsSeeA: {
    id: 'architect.sections.familyPedigree.boundaryOptions.recommendedParticipantsSeeA',
    defaultMessage:
      '<strong>Recommended</strong> — participants see a reminder in the completion checklist, but can finish the stage without satisfying the condition.',
    description:
      'Visible text in components / sections / FamilyPedigree / BoundaryOptions.',
  },
  requiredParticipantsCannotFinish: {
    id: 'architect.sections.familyPedigree.boundaryOptions.requiredParticipantsCannotFinish',
    defaultMessage:
      '<strong>Required</strong> — participants cannot finish the stage until the condition is satisfied.',
    description:
      'Visible text in components / sections / FamilyPedigree / BoundaryOptions.',
  },
  grandparentRequirement: {
    id: 'architect.sections.familyPedigree.boundaryOptions.grandparentRequirement',
    defaultMessage: 'Grandparent requirement',
    description:
      'The description text in components / sections / FamilyPedigree / BoundaryOptions.',
  },
  selectAnOption: {
    id: 'architect.sections.familyPedigree.boundaryOptions.selectAnOption',
    defaultMessage: 'Select an option',
    description:
      'The placeholder text in components / sections / FamilyPedigree / BoundaryOptions.',
  },
  asksTheParticipantToRecordTwo: {
    id: 'architect.sections.familyPedigree.boundaryOptions.asksTheParticipantToRecordTwo',
    defaultMessage:
      'Asks the participant to record two parents for each of their own parents, so that all of the participant’s grandparents appear in the family pedigree.',
    description:
      'Visible text in components / sections / FamilyPedigree / BoundaryOptions.',
  },
  coParentFamilyRequirement: {
    id: 'architect.sections.familyPedigree.boundaryOptions.coParentFamilyRequirement',
    defaultMessage: 'Co-parent family requirement',
    description:
      'The description text in components / sections / FamilyPedigree / BoundaryOptions.',
  },
  forEachOfTheParticipantRsquoSChildren: {
    id: 'architect.sections.familyPedigree.boundaryOptions.forEachOfTheParticipantRsquoSChildren',
    defaultMessage:
      'For each of the participant’s children, asks that the child’s other genetic parent has their own parents and grandparents recorded, extending the family pedigree to that side of the family. Participants without children can affirm this instead.',
    description:
      'Visible text in components / sections / FamilyPedigree / BoundaryOptions.',
  },
});

const BOUNDARY_REQUIREMENT_OPTIONS = [
  { value: 'required', label: configMessages.required },
  { value: 'recommended', label: configMessages.recommended },
  { value: 'off', label: configMessages.off },
];

const BoundaryOptions = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const requireGrandparentsInitial = useStageInitialValue<string>(
    'boundaries.requireGrandparents',
  );
  const requireChildrenContributorsInitial = useStageInitialValue<string>(
    'boundaries.requireChildrenContributors',
  );

  return (
    <Section
      title={intl.formatMessage(messages.pedigreeBoundaries)}
      description={intl.formatMessage(messages.setHowFarThePedigreeMust)}
    >
      <Paragraph>
        {intl.formatMessage(messages.eachBoundaryBelowCanBeSet)}
      </Paragraph>
      <ul className="mb-5 list-disc pl-7 [&_li]:mb-1">
        <li>
          {intl.formatMessage(messages.offTheConditionIs, {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </li>
        <li>
          {intl.formatMessage(messages.recommendedParticipantsSeeA, {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </li>
        <li>
          {intl.formatMessage(messages.requiredParticipantsCannotFinish, {
            strong: (chunks) => <strong>{chunks}</strong>,
          })}
        </li>
      </ul>
      <IssueAnchor
        fieldName="boundaries.requireGrandparents"
        description={intl.formatMessage(messages.grandparentRequirement)}
      />
      <ArchitectField
        name="boundaries.requireGrandparents"
        component={NativeSelectField}
        validation={{ required: true }}
        label={intl.formatMessage(messages.grandparentRequirement)}
        initialValue={requireGrandparentsInitial}
        options={formatConfig(BOUNDARY_REQUIREMENT_OPTIONS, intl)}
        placeholder={intl.formatMessage(messages.selectAnOption)}
        hint={
          <Paragraph>
            {intl.formatMessage(messages.asksTheParticipantToRecordTwo)}
          </Paragraph>
        }
      />
      <IssueAnchor
        fieldName="boundaries.requireChildrenContributors"
        description={intl.formatMessage(messages.coParentFamilyRequirement)}
      />
      <ArchitectField
        name="boundaries.requireChildrenContributors"
        component={NativeSelectField}
        validation={{ required: true }}
        label={intl.formatMessage(messages.coParentFamilyRequirement)}
        initialValue={requireChildrenContributorsInitial}
        options={formatConfig(BOUNDARY_REQUIREMENT_OPTIONS, intl)}
        placeholder={intl.formatMessage(messages.selectAnOption)}
        hint={
          <Paragraph>
            {intl.formatMessage(messages.forEachOfTheParticipantRsquoSChildren)}
          </Paragraph>
        }
      />
    </Section>
  );
};
export default BoundaryOptions;
