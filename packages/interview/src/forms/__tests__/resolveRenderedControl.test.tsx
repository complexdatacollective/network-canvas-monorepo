import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { asEntityAttributeReference } from '@codaco/protocol-validation';

import { selectFieldMetadataFromVariables } from '../../selectors/forms';
import ProtocolField from '../ProtocolField';
import { resolveRenderedControl } from '../resolveRenderedControl';

const REQUIRED_BOOLEAN = {
  name: 'Consented',
  type: 'boolean' as const,
  component: 'Toggle' as const,
  options: [{ label: 'Yes', value: true }],
  validation: { required: true },
};

describe('resolveRenderedControl', () => {
  it('swaps a required boolean Toggle for Boolean and drops its options', () => {
    expect(
      resolveRenderedControl({
        type: 'boolean',
        component: 'Toggle',
        validation: { required: true },
      }),
    ).toEqual({ component: 'Boolean', optionsApply: false });
  });

  it('leaves an optional boolean Toggle alone', () => {
    expect(
      resolveRenderedControl({
        type: 'boolean',
        component: 'Toggle',
        validation: { required: false },
      }),
    ).toEqual({ component: 'Toggle', optionsApply: true });
  });

  it('leaves a required non-boolean alone', () => {
    expect(
      resolveRenderedControl({
        type: 'text',
        component: 'Text',
        validation: { required: true },
      }),
    ).toEqual({ component: 'Text', optionsApply: true });
  });

  it('tolerates a variable with no validation block', () => {
    expect(
      resolveRenderedControl({ type: 'boolean', component: 'Toggle' }),
    ).toEqual({ component: 'Toggle', optionsApply: true });
  });
});

/**
 * The correction has one owner, so the interview's field metadata and the
 * standalone `ProtocolField` — which authoring tools mount on their own —
 * cannot decide differently about the same variable.
 */
describe('every path through the correction agrees', () => {
  it('resolves the interview metadata through the shared resolver', () => {
    const [meta] = selectFieldMetadataFromVariables(
      { consented: REQUIRED_BOOLEAN },
      [
        {
          variable: asEntityAttributeReference('consented'),
          prompt: 'Do you consent?',
        },
      ],
    );

    const resolved = resolveRenderedControl({
      type: REQUIRED_BOOLEAN.type,
      component: REQUIRED_BOOLEAN.component,
      validation: REQUIRED_BOOLEAN.validation,
    });

    expect(meta?.component).toBe(resolved.component);
    // The options the swap invalidates are gone from the metadata too.
    expect(
      meta && 'options' in meta ? meta.options : undefined,
    ).toBeUndefined();
  });

  it('renders the swapped control from a standalone ProtocolField', () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <ProtocolField
          field={{
            variable: 'consented',
            label: 'Do you consent?',
            type: 'boolean',
            component: 'Toggle',
            options: REQUIRED_BOOLEAN.options,
            validation: { required: true },
          }}
        />
      </Form>,
    );

    // Boolean's own unselected Yes/No pair, not a switch and not the single
    // authored option — which would be a required question with one answer.
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByRole('radio', { name: 'Yes' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'No' })).toBeInTheDocument();
  });
});
