import { screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

vi.mock('~/components/EditorLayout', () => ({
  Section: ({
    children,
    title,
  }: {
    children: ReactNode;
    title?: ReactNode;
  }) => (
    <div
      data-testid="section"
      data-title={typeof title === 'string' ? title : ''}
    >
      {title && <h2>{title}</h2>}
      {children}
    </div>
  ),
  Subsection: ({
    children,
    title,
  }: {
    children: ReactNode;
    title?: ReactNode;
  }) => (
    <section data-testid="subsection">
      {title && <h3>{title}</h3>}
      {children}
    </section>
  ),
  Row: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// The multi-select is exercised in its own test; here we only assert it renders.
vi.mock('../EdgeTypeMultiSelect', () => ({
  default: () => <div data-testid="edge-type-multiselect" />,
}));

// Surface the wiring (fieldName, entity, type, editFormName) as data-attributes
// so the tests assert the real bindings rather than just "a mock rendered".
vi.mock('~/components/EditableAttributesList/EditableAttributesList', () => ({
  default: ({
    fieldName,
    entity,
    type,
    form,
    editFormName,
  }: {
    fieldName: string;
    entity: string;
    type: string | null;
    form: string;
    editFormName: string;
    handleChangeFields: unknown;
  }) => (
    <div
      data-testid="attributes-list"
      data-fieldname={fieldName}
      data-entity={entity}
      data-type={type ?? ''}
      data-parentform={form}
      data-editformname={editFormName}
    />
  ),
}));

// `EdgeAttributeBlock` calls `useComposerFieldCommit({entity, type})` itself
// now (no more `withComposerFormHandlers` wrapper) — stub it so the test
// doesn't need a full `activeProtocol`/dispatch-capable store.
vi.mock('~/components/sections/Form/fieldCommit', () => ({
  useComposerFieldCommit: () => () => ({ success: true as const }),
}));

const mockCodebook = {
  edge: {
    knows: { name: 'Knows', color: 'edge-color-seq-1' },
    likes: { name: 'Likes', color: 'edge-color-seq-2' },
  },
};

vi.mock('~/selectors/protocol', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/selectors/protocol')>();
  return {
    ...actual,
    getCodebook: () => mockCodebook,
  };
});

import EdgeConfiguration from '../EdgeConfiguration';

type EdgeArg = {
  id: string;
  subject: { entity: 'edge'; type: string };
  form?: Record<string, unknown>;
};

// The section reads its live `edges` array off the stage form store, which
// only holds registered fields — `edges` here registers through the (mocked)
// multi-select's ArchitectField, seeded by the committed stage passed to
// renderStageForm. Rendering through the real bridge (rather than stubbing
// `formValueSelector`) is what makes this an honest test of the hook-based
// read.
const renderSection = ({ edges }: { edges: EdgeArg[] }) =>
  renderStageForm({
    committedStage: asStage({ edges }),
    children: (
      <EdgeConfiguration
        stagePath="stages[0]"
        stagePosition={0}
        interfaceType="NetworkComposer"
      />
    ),
  });

describe('EdgeConfiguration', () => {
  it('renders the multi-select', () => {
    renderSection({ edges: [] });
    expect(screen.getByTestId('edge-type-multiselect')).toBeInTheDocument();
  });

  it('renders the multi-select under the "Edge types" subsection heading', () => {
    renderSection({ edges: [] });
    expect(
      screen.getByRole('heading', { name: /edge types/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('subsection')).toContainElement(
      screen.getByTestId('edge-type-multiselect'),
    );
  });

  it('renders only the multi-select when no edge types are selected', () => {
    renderSection({ edges: [] });
    expect(screen.queryByTestId('attributes-list')).toBeNull();
    expect(screen.getByTestId('edge-type-multiselect')).toBeInTheDocument();
  });

  it('renders an attributes block per selected edge type bound to the indexed path', () => {
    renderSection({
      edges: [
        { id: 'a', subject: { entity: 'edge', type: 'knows' } },
        { id: 'b', subject: { entity: 'edge', type: 'likes' } },
      ],
    });
    const lists = screen.getAllByTestId('attributes-list');
    expect(lists.map((l) => l.dataset.fieldname)).toEqual([
      'edges[0].form.fields',
      'edges[1].form.fields',
    ]);
  });

  it('scopes each attributes block to entity="edge" and its own edge type', () => {
    renderSection({
      edges: [
        { id: 'a', subject: { entity: 'edge', type: 'knows' } },
        { id: 'b', subject: { entity: 'edge', type: 'likes' } },
      ],
    });
    const lists = screen.getAllByTestId('attributes-list');
    expect(lists.map((l) => l.dataset.entity)).toEqual(['edge', 'edge']);
    expect(lists.map((l) => l.dataset.type)).toEqual(['knows', 'likes']);
  });

  it('gives each edge type a distinct editFormName to avoid form-state collisions', () => {
    renderSection({
      edges: [
        { id: 'a', subject: { entity: 'edge', type: 'knows' } },
        { id: 'b', subject: { entity: 'edge', type: 'likes' } },
      ],
    });
    const lists = screen.getAllByTestId('attributes-list');
    expect(lists.map((l) => l.dataset.editformname)).toEqual([
      'edge-attr-edit-knows',
      'edge-attr-edit-likes',
    ]);
  });

  it('resolves the edge label from the codebook, falling back to the raw type', () => {
    renderSection({
      edges: [
        { id: 'a', subject: { entity: 'edge', type: 'knows' } },
        { id: 'c', subject: { entity: 'edge', type: 'unknownType' } },
      ],
    });
    expect(
      screen.getByRole('heading', { name: /Edge Attributes — Knows/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Edge Attributes — unknownType/ }),
    ).toBeInTheDocument();
  });

  it('wraps each edge attributes list in an "Editable attributes" subsection', () => {
    renderSection({
      edges: [
        { id: 'a', subject: { entity: 'edge', type: 'knows' } },
        { id: 'b', subject: { entity: 'edge', type: 'likes' } },
      ],
    });
    const editableHeadings = screen.getAllByRole('heading', {
      name: /^editable attributes$/i,
    });
    expect(editableHeadings).toHaveLength(2);
  });
});
