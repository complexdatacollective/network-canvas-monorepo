import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Form from '@codaco/fresco-ui/form/Form';
import { findDanglingIdReferences } from '@codaco/fresco-ui/utils/ariaIdReferences';

vi.mock('../../hooks/useCelebrate', () => ({
  useCelebrate: () => vi.fn(),
}));

// QuickAddField reads node presentation state through useStageSelector.
// Dispatch on the selector sentinel exported by the (mocked) selector modules.
vi.mock('../../selectors/session', () => ({
  getNodeColorSelector: 'getNodeColorSelector',
  getNodeTypeDefinition: 'getNodeTypeDefinition',
  getPromptAdditionalAttributes: 'getPromptAdditionalAttributes',
  resolveNodeShape: () => 'circle',
}));

vi.mock('../../selectors/name-generator', () => ({
  getCanAddMultipleNodes: 'getCanAddMultipleNodes',
  getNodeIconName: 'getNodeIconName',
}));

vi.mock('../../hooks/useStageSelector', () => ({
  useStageSelector: (selector: unknown) => {
    switch (selector) {
      case 'getNodeColorSelector':
        return 'node-color-seq-1';
      case 'getNodeTypeDefinition':
        return { name: 'Person', shape: { default: 'circle' } };
      case 'getPromptAdditionalAttributes':
        return {};
      case 'getNodeIconName':
        return 'add-a-person';
      case 'getCanAddMultipleNodes':
        return true;
      default:
        return undefined;
    }
  },
}));

import QuickAddField from '../NameGenerator/components/QuickAddField';
import AddNodeInput from '../NetworkComposer/AddNodeInput';

/**
 * Both of these components spread `useField`'s `fieldProps` onto markup of
 * their own rather than rendering through `BaseField`, so every ARIA reference
 * those props carry has to resolve to something they actually rendered.
 *
 * The failure this guards is silent: a dangling `aria-describedby` makes some
 * screen readers drop the whole description, and a dangling `aria-labelledby`
 * outranks the control's own `aria-label`, so the control can be announced
 * with no name. Nothing throws, and the rendered output looks correct.
 */
function expectNoDanglingReferences(container: HTMLElement) {
  expect(findDanglingIdReferences(container)).toEqual([]);
}

afterEach(() => {
  cleanup();
});

describe('QuickAddField ARIA references', () => {
  it('resolves every ARIA reference on the quick-add input', async () => {
    const { container } = render(
      <Form onSubmit={() => ({ success: true })}>
        <QuickAddField
          name="name"
          placeholder="Type a label and press enter..."
          disabled={false}
        />
      </Form>,
    );

    await userEvent.click(screen.getByTestId('quick-add-toggle'));
    await screen.findByTestId('quick-add-input');

    expectNoDanglingReferences(container);
  });

  it('resolves every ARIA reference when the target variable is required', async () => {
    // `required` is what used to add a `${id}-required` IDREF: BaseField
    // renders that marker, and this component does not.
    const { container } = render(
      <Form onSubmit={() => ({ success: true })}>
        <QuickAddField
          name="name"
          placeholder="Type a label and press enter..."
          disabled={false}
          required
        />
      </Form>,
    );

    await userEvent.click(screen.getByTestId('quick-add-toggle'));
    await screen.findByTestId('quick-add-input');

    expectNoDanglingReferences(container);
  });

  it('names the quick-add input after the entity being added', async () => {
    render(
      <Form onSubmit={() => ({ success: true })}>
        <QuickAddField
          name="name"
          placeholder="Type a label and press enter..."
          disabled={false}
        />
      </Form>,
    );

    await userEvent.click(screen.getByTestId('quick-add-toggle'));

    // Asserted through the accessible name rather than the attribute, so it
    // fails if a future reference ever displaces the label again.
    expect(
      await screen.findByRole('textbox', { name: 'Person name' }),
    ).toBeInTheDocument();
  });
});

describe('AddNodeInput ARIA references', () => {
  it('resolves every ARIA reference on the add-node input', () => {
    const { container } = render(
      <AddNodeInput
        entityLabel="Person"
        targetVariable="name"
        onCreate={async () => {}}
      />,
    );

    expectNoDanglingReferences(container);
  });

  it('resolves every ARIA reference when the target variable is required', () => {
    const { container } = render(
      <AddNodeInput
        entityLabel="Person"
        targetVariable="name"
        onCreate={async () => {}}
        required
      />,
    );

    expectNoDanglingReferences(container);
  });

  it('still describes the error region it renders itself', () => {
    render(
      <AddNodeInput
        entityLabel="Person"
        targetVariable="name"
        onCreate={async () => {}}
      />,
    );

    const input = screen.getByRole('textbox', { name: 'Person name' });
    // Not merely "nothing dangles": the region this component does render has
    // to still be named, or suppressing the rest would have cost the errors.
    expect(input.getAttribute('aria-describedby')).toBe(`${input.id}-error`);
    expect(document.getElementById(`${input.id}-error`)).not.toBeNull();
  });
});
