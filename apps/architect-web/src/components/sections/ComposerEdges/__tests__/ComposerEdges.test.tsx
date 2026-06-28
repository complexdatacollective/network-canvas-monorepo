import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/EditorLayout', () => ({
  Section: ({
    children,
    title,
  }: {
    children: React.ReactNode;
    title?: React.ReactNode;
  }) => (
    <div>
      {title && <h2>{title}</h2>}
      {children}
    </div>
  ),
  Row: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Surface the bindings we care about as data-attributes so the tests can
// assert the real wiring rather than just "a mock rendered".
vi.mock('~/components/EditableList', () => ({
  default: ({
    fieldName,
    form,
    editFormName,
  }: {
    fieldName: string;
    form?: string;
    editFormName?: string;
    editComponent: unknown;
    previewComponent: unknown;
  }) => (
    <div
      data-testid="editable-list"
      data-fieldname={fieldName}
      data-parentform={form ?? ''}
      data-editformname={editFormName ?? ''}
    />
  ),
  formName: 'editable-list-form',
}));

vi.mock('~/components/IssueAnchor', () => ({
  default: () => null,
}));

vi.mock('~/components/Form/ValidatedField', () => ({
  default: ({ name }: { name: string }) => (
    <div data-testid="validated-field" data-name={name} />
  ),
}));

vi.mock(
  '~/components/sections/fields/EntitySelectField/EntitySelectField',
  () => ({
    default: () => null,
  }),
);

vi.mock('~/components/sections/Form/FieldFields', () => ({
  default: () => null,
}));
vi.mock('~/components/sections/Form/FieldPreview', () => ({
  default: () => null,
}));
vi.mock('~/components/sections/Form/helpers', () => ({
  itemSelector: vi.fn(() => vi.fn()),
  normalizeField: vi.fn((v: unknown) => v),
}));
// withFormHandlers passes through (no codebook side-effects in unit tests).
vi.mock('~/components/sections/Form/withFormHandlers', () => ({
  default:
    (Component: React.ComponentType<Record<string, unknown>>) =>
    (props: Record<string, unknown>) => (
      <Component {...props} handleChangeFields={() => undefined} />
    ),
}));

const mockCodebook = {
  edge: {
    friend: { name: 'Friend', color: 'edge-color-seq-1' },
  },
};

vi.mock('react-redux', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-redux')>();
  const useSelector = (selector: (state: unknown) => unknown) =>
    selector({ __codebook: mockCodebook });
  // Preserve `withTypes` so `ducks/hooks.ts` (imported transitively) still works.
  Object.assign(useSelector, { withTypes: actual.useSelector.withTypes });
  return {
    ...actual,
    useSelector,
  };
});

vi.mock('~/selectors/protocol', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/selectors/protocol')>();
  return {
    ...actual,
    getCodebook: () => mockCodebook,
  };
});

// `formValueSelector(form)(state, 'subject')` is what EdgeFields uses to read
// the LIVE edge subject from the edge-modal form. We drive that read here via a
// mutable holder so each test exercises the real live-subject code path.
const liveFormValues: { subject?: { entity: string; type: string } } = {};
vi.mock('redux-form', async (importOriginal) => {
  const actual = await importOriginal<typeof import('redux-form')>();
  return {
    ...actual,
    formValueSelector: () => (_state: unknown, field: string) =>
      field === 'subject' ? liveFormValues.subject : undefined,
  };
});

import ComposerEdges from '../ComposerEdges';
import EdgeFields from '../EdgeFields';
import EdgePreview from '../EdgePreview';

describe('ComposerEdges', () => {
  it('renders the "Edges" section with an EditableList bound to fieldName="edges"', () => {
    render(
      <ComposerEdges
        form="edit-stage"
        stagePath="stages[0]"
        interfaceType="NetworkComposer"
      />,
    );

    expect(screen.getByRole('heading', { name: /edges/i })).toBeDefined();
    const list = screen.getByTestId('editable-list');
    expect(list.getAttribute('data-fieldname')).toBe('edges');
    expect(list.getAttribute('data-parentform')).toBe('edit-stage');
  });
});

describe('EdgeFields', () => {
  const renderFields = (subject?: { entity: string; type: string }) => {
    liveFormValues.subject = subject;
    return render(
      <EdgeFields id="e1" subject={subject} form="editable-list-form" />,
    );
  };

  it('renders an edge-type select bound to name="subject"', () => {
    renderFields({ entity: 'edge', type: 'friend' });
    const subjectField = screen
      .getAllByTestId('validated-field')
      .find((el) => el.getAttribute('data-name') === 'subject');
    expect(subjectField).toBeDefined();
  });

  it('renders a nested EditableList for form.fields with a distinct level-3 form name', () => {
    renderFields({ entity: 'edge', type: 'friend' });
    const nested = screen
      .getAllByTestId('editable-list')
      .find((el) => el.getAttribute('data-fieldname') === 'form.fields');
    expect(nested).toBeDefined();
    expect(nested?.getAttribute('data-editformname')).toBe(
      'edge-form-field-edit',
    );
    expect(nested?.getAttribute('data-parentform')).toBe('editable-list-form');
  });

  it('is title-less (renders no form-title field)', () => {
    renderFields({ entity: 'edge', type: 'friend' });
    const titleField = screen
      .queryAllByTestId('validated-field')
      .find(
        (el) =>
          el.getAttribute('data-name') === 'form.title' ||
          el.getAttribute('data-name') === 'title',
      );
    expect(titleField).toBeUndefined();
    expect(document.querySelector('[name="form.title"]')).toBeNull();
  });

  it('does not render the attribute form until an edge type is selected', () => {
    renderFields(undefined);
    const nested = screen
      .queryAllByTestId('editable-list')
      .find((el) => el.getAttribute('data-fieldname') === 'form.fields');
    expect(nested).toBeUndefined();
  });
});

describe('EdgePreview', () => {
  it('renders the codebook edge label and the attribute count', () => {
    render(
      <EdgePreview
        subject={{ entity: 'edge', type: 'friend' }}
        form={{ fields: [{ id: 'a' }, { id: 'b' }] }}
      />,
    );
    expect(screen.getByText(/Friend/)).toBeDefined();
    expect(screen.getByText(/2 attributes/)).toBeDefined();
  });

  it('singularises the attribute count and falls back to the raw type', () => {
    render(
      <EdgePreview
        subject={{ entity: 'edge', type: 'unknownType' }}
        form={{ fields: [{ id: 'a' }] }}
      />,
    );
    expect(screen.getByText(/unknownType/)).toBeDefined();
    expect(screen.getByText(/1 attribute(?!s)/)).toBeDefined();
  });
});
