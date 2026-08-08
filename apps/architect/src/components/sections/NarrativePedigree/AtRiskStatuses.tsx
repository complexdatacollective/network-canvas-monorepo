import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageInitialValue } from '~/components/StageEditor/stageFormHooks';

const FIELD_NAME = 'showAtRiskStatuses';

const AtRiskStatuses = (_props: StageEditorSectionProps) => {
  // Read the committed stage; `false` is the missing-value fallback only. A
  // hardcoded `false` registered the field as off no matter what the stage
  // held, and the stage saves with `overwrite: true` over `getFormValues()` —
  // so merely opening a stage that had at-risk symbols on and saving any
  // unrelated edit turned them off. (The schema defaults this to `false`, so
  // an absent key is genuinely off; only an explicit `true` is at stake.)
  const initialValue = useStageInitialValue<boolean>(FIELD_NAME) ?? false;

  return (
    <Section title="At-Risk Statuses">
      <Row>
        <ArchitectField
          name={FIELD_NAME}
          component={ToggleField}
          inline
          initialValue={initialValue}
          label="Show possible (at-risk) statuses"
          hint={
            <Paragraph>
              Optionally show <strong>possible</strong> (at-risk) statuses
              alongside the certain ones, inferred from family structure and
              inheritance patterns.
            </Paragraph>
          }
        />
      </Row>
      <div className="[&_h5]:mt-5 [&_h5]:mb-1 [&_h5]:font-semibold [&_li]:mb-1 [&_p]:mb-2.5 [&_ul]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-7">
        <Paragraph>
          When enabled, the pedigree also shows a person who{' '}
          <em>may develop</em> a condition or <em>may carry</em> it. These are
          drawn as the usual status symbol with a question mark
          (&ldquo;?&rdquo;) added. A solid, filled symbol always indicates a
          clinically <em>affected</em> individual (per Bennett et al., 2022
          nomenclature), so at-risk relatives always appear as unfilled symbols
          marked with a &ldquo;?&rdquo;.
        </Paragraph>

        <h5>How it is calculated</h5>
        <Paragraph>
          At-risk statuses are not observed or diagnosed &mdash; they are
          inferred from the family structure together with each
          condition&rsquo;s inheritance pattern. For example:
        </Paragraph>
        <ul>
          <li>
            The child of a parent affected by a dominant condition is shown as{' '}
            <em>may develop</em> it.
          </li>
          <li>
            The child of two carriers of a recessive condition is shown as{' '}
            <em>may carry</em> it &mdash; or, where both parents are established
            carriers, <em>may develop</em> it.
          </li>
        </ul>
        <Paragraph>
          Two rules constrain how risk travels through the family:
        </Paragraph>
        <ul>
          <li>
            Only <em>biological</em> and <em>donor</em> relationships pass
            conditions on; social, adoptive, surrogate, and partner links do
            not.
          </li>
          <li>
            Where a person&rsquo;s biological sex is not known, sex-linked
            inheritance through that person is left uncertain rather than
            guessed.
          </li>
        </ul>

        <h5>Why this is off by default</h5>
        <Paragraph>
          At-risk symbols are a strong visual signal that can be read as
          established fact rather than inferred risk. They are intended for{' '}
          <strong>clinician-directed use</strong>, where the result is
          interpreted in context. Standard pedigree nomenclature (Bennett et
          al., 2022) deliberately does not encode probabilistic risk, so leave
          this off unless a clinician is guiding interpretation.
        </Paragraph>
      </div>
    </Section>
  );
};
export default AtRiskStatuses;
