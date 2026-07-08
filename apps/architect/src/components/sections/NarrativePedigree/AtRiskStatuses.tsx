import { Row, Section } from '~/components/EditorLayout';
import Toggle from '~/components/Form/Fields/Toggle';
import ValidatedField from '~/components/Form/ValidatedField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';

const AtRiskStatuses = (_props: StageEditorSectionProps) => (
  <Section
    title="At-Risk Statuses"
    summary={
      <p>
        Optionally show <strong>possible</strong> (at-risk) statuses alongside
        the certain ones, inferred from family structure and inheritance
        patterns.
      </p>
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
    <div className="[&_h5]:mt-(--space-md) [&_h5]:mb-(--space-xs) [&_h5]:font-semibold [&_li]:mb-(--space-xs) [&_p]:mb-(--space-sm) [&_ul]:mb-(--space-sm) [&_ul]:list-disc [&_ul]:pl-(--space-lg)">
      <p>
        When enabled, the pedigree also shows a person who <em>may develop</em>{' '}
        a condition or <em>may carry</em> it. These are drawn as the usual
        status symbol with a question mark (&ldquo;?&rdquo;) added. A solid,
        filled symbol always indicates a clinically <em>affected</em> individual
        (per Bennett et al., 2022 nomenclature), so at-risk relatives always
        appear as unfilled symbols marked with a &ldquo;?&rdquo;.
      </p>

      <h5>How it is calculated</h5>
      <p>
        At-risk statuses are not observed or diagnosed &mdash; they are inferred
        from the family structure together with each condition&rsquo;s
        inheritance pattern. For example:
      </p>
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
      <p>Two rules constrain how risk travels through the family:</p>
      <ul>
        <li>
          Only <em>biological</em> and <em>donor</em> relationships pass
          conditions on; social, adoptive, surrogate, and partner links do not.
        </li>
        <li>
          Where a person&rsquo;s biological sex is not known, sex-linked
          inheritance through that person is left uncertain rather than guessed.
        </li>
      </ul>

      <h5>Why this is off by default</h5>
      <p>
        At-risk symbols are a strong visual signal that can be read as
        established fact rather than inferred risk. They are intended for{' '}
        <strong>clinician-directed use</strong>, where the result is interpreted
        in context. Standard pedigree nomenclature (Bennett et al., 2022)
        deliberately does not encode probabilistic risk, so leave this off
        unless a clinician is guiding interpretation.
      </p>
    </div>
  </Section>
);

export default AtRiskStatuses;
