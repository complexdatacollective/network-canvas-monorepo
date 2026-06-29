import { Row, Section } from '~/components/EditorLayout';
import Toggle from '~/components/Form/Fields/Toggle';
import ValidatedField from '~/components/Form/ValidatedField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

const AtRiskStatuses = (_props: StageEditorSectionProps) => (
  <Section
    title="At-Risk Statuses"
    summary={
      <>
        <p>
          When enabled, the pedigree also shows <strong>possible</strong>{' '}
          (at-risk) statuses alongside the certain ones: a person who{' '}
          <em>may develop</em> a condition, <em>may carry</em> it, or{' '}
          <em>may be affected</em>. These are drawn as the usual status symbol
          with a question mark (&ldquo;?&rdquo;) added.
        </p>
        <p>
          <strong>How it is calculated.</strong> At-risk statuses are not
          observed or diagnosed &mdash; they are inferred from the family
          structure together with each condition&rsquo;s inheritance pattern.
          For example, the child of a parent affected by a dominant condition is
          shown as <em>may develop</em> it; the child of two carriers of a
          recessive condition is shown as <em>may carry</em> it, or{' '}
          <em>may be affected</em> when both copies could be inherited (such as
          a consanguineous union).
        </p>
        <p>
          <strong>Why this is off by default.</strong> At-risk symbols are a
          strong visual signal that can be read as established fact rather than
          inferred risk. They are intended for{' '}
          <strong>clinician-directed use</strong>, where the result is
          interpreted in context. Standard pedigree nomenclature (Bennett et
          al., 2022) deliberately does not encode probabilistic risk, so leave
          this off unless a clinician is guiding interpretation.
        </p>
      </>
    }
  >
    <Row>
      <ValidatedField
        name="showAtRiskStatuses"
        component={Toggle as React.ComponentType}
        validation={{}}
        componentProps={{
          label: 'Show possible (at-risk) statuses',
        }}
      />
    </Row>
  </Section>
);

export default AtRiskStatuses;
