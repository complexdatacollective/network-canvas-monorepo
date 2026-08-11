import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const BOUNDARY_REQUIREMENT_OPTIONS = [
  { value: 'required', label: 'Required' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'off', label: 'Off' },
];

const BoundaryOptions = (_props: StageEditorSectionProps) => {
  const requireGrandparentsInitial = useStageInitialValue<string>(
    'boundaries.requireGrandparents',
  );
  const requireChildrenContributorsInitial = useStageInitialValue<string>(
    'boundaries.requireChildrenContributors',
  );

  return (
    <Section
      title="Boundary Options"
      summary={
        <Paragraph>
          Configure how far the family pedigree must extend beyond the
          participant&rsquo;s immediate family.
        </Paragraph>
      }
    >
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
      <Row>
        <IssueAnchor
          fieldName="boundaries.requireGrandparents"
          description="Require Grandparents"
        />
        <ArchitectField
          name="boundaries.requireGrandparents"
          component={NativeSelectField}
          validation={{ required: true }}
          label="Require Grandparents"
          initialValue={requireGrandparentsInitial}
          options={BOUNDARY_REQUIREMENT_OPTIONS}
          placeholder="Select an option"
          hint={
            <Paragraph>
              Asks the participant to record two parents for each of their own
              parents, so that all of the participant&rsquo;s grandparents
              appear in the family pedigree.
            </Paragraph>
          }
        />
      </Row>
      <Row>
        <IssueAnchor
          fieldName="boundaries.requireChildrenContributors"
          description="Require Co-Parents' Families"
        />
        <ArchitectField
          name="boundaries.requireChildrenContributors"
          component={NativeSelectField}
          validation={{ required: true }}
          label="Require Co-Parents' Families"
          initialValue={requireChildrenContributorsInitial}
          options={BOUNDARY_REQUIREMENT_OPTIONS}
          placeholder="Select an option"
          hint={
            <Paragraph>
              For each of the participant&rsquo;s children, asks that the
              child&rsquo;s other genetic parent has their own parents and
              grandparents recorded, extending the family pedigree to that side
              of the family. Participants without children can affirm this
              instead.
            </Paragraph>
          }
        />
      </Row>
    </Section>
  );
};
export default BoundaryOptions;
