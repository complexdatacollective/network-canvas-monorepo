import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  FormLevelValidate,
  LenientSubmitHandler,
} from '~/components/DialogForm/formLevelValidate';

// The real form store, field errors and form-level validation, under a plain
// submit button: what is under test is what the dialog's submit answers and
// what the form then shows, not the dialog chrome.
vi.mock('~/components/DialogForm/DialogForm', async () => {
  const { default: Form } = await import('@codaco/fresco-ui/form/Form');
  const { withFormLevelValidate } =
    await import('~/components/DialogForm/formLevelValidate');
  return {
    default: (props: {
      children?: ReactNode;
      onSubmit: LenientSubmitHandler;
      validate?: FormLevelValidate;
    }) => (
      <Form onSubmit={withFormLevelValidate(props.onSubmit, props.validate)}>
        {props.children}
        <button type="submit">Save</button>
      </Form>
    ),
  };
});

vi.mock('~/components/Form/Fields/ColorPicker', () => ({
  default: () => null,
}));
vi.mock('@codaco/fresco-ui/form/fields/IconPicker', () => ({
  default: () => null,
}));
vi.mock('@codaco/protocol-builder/fields/ShapePickerField', () => ({
  default: () => null,
}));
vi.mock(
  '@codaco/protocol-builder/fields/CustomShapesField',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@codaco/protocol-builder/fields/CustomShapesField')
    >()),
    default: () => null,
  }),
);
vi.mock('~/components/TypeEditor/ShapeVariableMapping', () => ({
  default: () => null,
}));

const protocol = {
  codebook: {
    node: {
      person: {
        name: 'Person',
        color: 'node-color-seq-1',
        iconVariant: 'add-a-person',
        shape: { default: 'circle' },
        customShapes: { s1: { name: 'Star', asset: 'asset-1' } },
        variables: {},
      },
    },
    edge: {},
  },
};

vi.mock('~/selectors/protocol', () => ({
  getProtocol: () => protocol,
  getCodebook: () => protocol.codebook,
  getLocalization: () => undefined,
}));

vi.mock('react-redux', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-redux')>()),
  useStore: () => ({}),
}));
vi.mock('~/ducks/modules/app', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/ducks/modules/app')>()),
  getActiveProtocolId: () => 'protocol-1',
}));

const events: string[] = [];
const planStagedResourceAdoption = vi.fn();
vi.mock('~/protocolBuilder/useArchitectClient', async () => {
  const { createInMemoryHost } =
    await import('@codaco/protocol-builder/testing/host/createInMemoryHost');
  const host = createInMemoryHost({ sections: {} });
  return {
    useArchitectClient: () => ({
      adapter: host.adapter,
      planStagedResourceAdoption,
    }),
  };
});

// The edit has staged the image the type's one custom shape is drawn from.
vi.mock('@codaco/protocol-builder/resources/client', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('@codaco/protocol-builder/resources/client')
    >();
  return {
    ...actual,
    useStagedResources: () => ({
      editId: 'edit-1',
      staged: [],
      promotion: () => ({ editId: 'edit-1', resourceIds: ['asset-1'] }),
      promoted: () => events.push('promoted'),
      discardAll: async () => ({ status: 'ok' }),
    }),
  };
});

const dispatchSpy = vi.fn(() => ({
  unwrap: async () => {
    events.push('saved');
    return { type: 'person' };
  },
}));
vi.mock('~/ducks/hooks', () => ({
  useAppDispatch: () => dispatchSpy,
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
}));

import EntityTypeDialog from '../EntityTypeDialog';

const renderDialog = () => {
  const onClose = vi.fn();
  render(
    <EntityTypeDialog show entity="node" type="person" onClose={onClose} />,
  );
  return { onClose };
};

describe('EntityTypeDialog saving a type with an imported shape image', () => {
  beforeEach(() => {
    events.length = 0;
    dispatchSpy.mockClear();
    planStagedResourceAdoption.mockReset();
  });

  it('refuses to save when the image can no longer be kept', async () => {
    planStagedResourceAdoption.mockReturnValue({
      status: 'failed',
      resourceId: 'asset-1',
    });
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'The image for the shape "Star" is no longer available. Remove this shape and add it again.',
      ),
    ).toBeInTheDocument();
    expect(planStagedResourceAdoption).toHaveBeenCalledWith({
      editId: 'edit-1',
      resourceIds: ['asset-1'],
    });
    expect(dispatchSpy).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(events).toEqual([]);
  });

  it('names no shape when none uses the refused image', async () => {
    planStagedResourceAdoption.mockReturnValue({
      status: 'failed',
      resourceId: 'asset-other',
    });
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText(
        'An image added to this node type is no longer available. Remove the shape that uses it, then add the shape again.',
      ),
    ).toBeInTheDocument();
    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('hands the image over only after the type is saved', async () => {
    planStagedResourceAdoption.mockImplementation(() => {
      events.push('planned');
      return { status: 'ok', complete: () => events.push('completed') };
    });
    const { onClose } = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(events).toEqual(['planned', 'saved', 'completed', 'promoted']);
  });
});
