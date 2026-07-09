import type { ComponentType } from 'react';
import { FormSection } from 'redux-form';

import NativeSelectField from '@codaco/fresco-ui/form/fields/Select/Native';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import { FrescoReduxField } from '~/components/Form';
import ValidatedField from '~/components/Form/ValidatedField';
import IssueAnchor from '~/components/IssueAnchor';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

const FrescoNativeSelectField = NativeSelectField as ComponentType<
  Record<string, unknown>
>;

const BOUNDARY_REQUIREMENT_OPTIONS = [
  { value: 'required', label: 'Required' },
  { value: 'recommended', label: 'Recommended' },
  { value: 'off', label: 'Off' },
];
const BoundaryOptions = (_props: StageEditorSectionProps) => (
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
        <strong>Off</strong> — the condition is never checked, and participants
        are not asked to provide this information.
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
    <FormSection name="boundaries">
      <Row>
        <IssueAnchor
          fieldName="boundaries.requireGrandparents"
          description="Require Grandparents"
        />
        <ValidatedField
          name="requireGrandparents"
          component={FrescoReduxField}
          validation={{ required: true }}
          label="Require Grandparents"
          componentProps={{
            fieldComponent: FrescoNativeSelectField,
            options: BOUNDARY_REQUIREMENT_OPTIONS,
            placeholder: 'Select an option',
          }}
        />
        <Paragraph className="mt-1 text-sm text-current/70">
          Asks the participant to record two parents for each of their own
          parents, so that all of the participant&rsquo;s grandparents appear in
          the family pedigree.
        </Paragraph>
      </Row>
      <Row>
        <IssueAnchor
          fieldName="boundaries.requireChildrenContributors"
          description="Require Co-Parents' Families"
        />
        <ValidatedField
          name="requireChildrenContributors"
          component={FrescoReduxField}
          validation={{ required: true }}
          label="Require Co-Parents' Families"
          componentProps={{
            fieldComponent: FrescoNativeSelectField,
            options: BOUNDARY_REQUIREMENT_OPTIONS,
            placeholder: 'Select an option',
          }}
        />
        <Paragraph className="mt-1 text-sm text-current/70">
          For each of the participant&rsquo;s children, asks that the
          child&rsquo;s other genetic parent has their own parents and
          grandparents recorded, extending the family pedigree to that side of
          the family. Participants without children can affirm this instead.
        </Paragraph>
      </Row>
    </FormSection>
  </Section>
);
export default BoundaryOptions;
