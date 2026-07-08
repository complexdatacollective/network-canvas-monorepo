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
    <div className="[&_h5]:mt-5 [&_h5]:mb-1 [&_h5]:font-semibold [&_li]:mb-1 [&_p]:mb-2.5 [&_ul]:mb-2.5 [&_ul]:list-disc [&_ul]:pl-7">
      <p>
        When enabled, the pedigree also shows a person who <em>may develop</em>{' '}
        a condition, <em>may carry</em> it, or <em>may be affected</em>. These
        are drawn as the usual status symbol with a question mark
        (&ldquo;?&rdquo;) added.
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
          <em>may carry</em> it, or <em>may be affected</em> when both copies
          could be inherited (such as a consanguineous union).
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

      <h5>&ldquo;May be affected&rdquo; and known carriers</h5>
      <p>
        The <em>may be affected</em> (possibly two copies) symbol is only shown
        for a person whose status is still open. It is deliberately{' '}
        <strong>not</strong> shown for someone the pedigree already establishes
        is an unaffected carrier of a <em>recessive</em> condition, because such
        a person cannot also be affected.
      </p>
      <p>
        The one exception is <strong>X-linked recessive</strong>: a daughter of
        an affected father and a carrier mother is still shown as{' '}
        <em>may be affected</em>, because she can inherit an affected copy from
        each parent, and carrier females of X-linked conditions can themselves
        show symptoms. X-linked risk is traced along the{' '}
        <strong>maternal line</strong> only, so relatives connected through an
        unaffected father are not marked.
      </p>

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
