import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';

import ProtocolField from '../../form/ProtocolField.tsx';
import BuilderSection from '../BuilderSection.tsx';

const GRANDPARENTS_FIELD = 'boundaries.requireGrandparents';
const CHILDREN_CONTRIBUTORS_FIELD = 'boundaries.requireChildrenContributors';

const REQUIREMENT_OPTIONS = [
  { value: 'required', label: 'Required' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'off', label: 'Off' },
];

export type BoundaryOptionsCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  grandparentsLabel: string;
  childrenContributorsLabel: string;
  selectPlaceholder: string;
}>;

const DEFAULT_COPY: BoundaryOptionsCopy = {
  sectionTitle: 'Pedigree boundaries',
  description:
    "Set how far the pedigree must extend beyond the participant's immediate family.",
  grandparentsLabel: 'Grandparent requirement',
  childrenContributorsLabel: 'Co-parent family requirement',
  selectPlaceholder: 'Select an option',
};

export type BoundaryOptionsSectionProps = Readonly<{
  copy?: Partial<BoundaryOptionsCopy>;
}>;

/**
 * How far the pedigree has to reach before the participant may finish.
 *
 * Both boundaries are owned together because they are the two members of one
 * schema object: a section owning part of a nested value has to render every
 * part of it, or the half it does not render is written back over on save.
 */
export default function BoundaryOptionsSection({
  copy,
}: BoundaryOptionsSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <Paragraph>
        Each boundary below can be set to one of three enforcement levels, which
        determine how the interview behaves when the condition is not yet met:
      </Paragraph>
      <ul className="mb-5 list-disc pl-7 [&_li]:mb-1">
        <li>
          <strong>Off</strong> — the condition is never checked, and
          participants are not asked to provide this information.
        </li>
        <li>
          <strong>Recommended</strong> — participants see a reminder in the
          completion checklist, but can finish the stage without satisfying the
          condition.
        </li>
        <li>
          <strong>Required</strong> — participants cannot finish the stage until
          the condition is satisfied.
        </li>
      </ul>
      <ProtocolField<typeof NativeSelectField>
        name={GRANDPARENTS_FIELD}
        component={NativeSelectField}
        label={words.grandparentsLabel}
        hint="Asks the participant to record two parents for each of their own parents, so that all of the participant's grandparents appear in the family pedigree."
        options={REQUIREMENT_OPTIONS}
        placeholder={words.selectPlaceholder}
        required
      />
      <ProtocolField<typeof NativeSelectField>
        name={CHILDREN_CONTRIBUTORS_FIELD}
        component={NativeSelectField}
        label={words.childrenContributorsLabel}
        hint="For each of the participant's children, asks that the child's other genetic parent has their own parents and grandparents recorded, extending the family pedigree to that side of the family. Participants without children can affirm this instead."
        options={REQUIREMENT_OPTIONS}
        placeholder={words.selectPlaceholder}
        required
      />
    </BuilderSection>
  );
}
