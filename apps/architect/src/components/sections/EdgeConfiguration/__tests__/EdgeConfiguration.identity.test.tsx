import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('~/components/EditorLayout', () => ({
  Section: ({
    children,
    title,
  }: {
    children: ReactNode;
    title?: ReactNode;
  }) => (
    <div data-testid="section">
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

// The real multi-select is a `CheckboxGroupField` over the codebook's edge
// types; unchecking one emits the surviving entries in checked order, which is
// all this test needs from it (`EdgeTypeMultiSelectInner.handleChange`).
vi.mock('../EdgeTypeMultiSelect', () => ({
  default: ({
    value,
    onChange,
  }: {
    value?: { id: string; subject: { entity: 'edge'; type: string } }[];
    onChange?: (
      edges: { id: string; subject: { entity: 'edge'; type: string } }[],
    ) => void;
  }) => (
    <div data-testid="edge-type-multiselect">
      {(value ?? []).map((edge) => (
        <button
          key={edge.id}
          type="button"
          onClick={() =>
            onChange?.((value ?? []).filter((entry) => entry.id !== edge.id))
          }
        >
          Remove {edge.subject.type}
        </button>
      ))}
    </div>
  ),
}));

// A stand-in that connects to the stage form the same way the real attributes
// list does — see `edgeAttributesListStub` for why that matters here.
vi.mock('~/components/Form/arrayFields/EditableAttributesList', async () => ({
  default: (await import('./edgeAttributesListStub')).default,
}));

// `EdgeAttributeBlock` calls `useComposerFieldCommit({entity, type})`, which
// reaches for a dispatch-capable protocol store this harness does not mount.
vi.mock('~/components/sections/Form/fieldCommit', () => ({
  useComposerFieldCommit: () => () => ({ success: true as const }),
}));

const mockCodebook = {
  edge: {
    knows: { name: 'Knows', color: 'edge-color-seq-1' },
    likes: { name: 'Likes', color: 'edge-color-seq-2' },
    trusts: { name: 'Trusts', color: 'edge-color-seq-3' },
  },
};

vi.mock('~/selectors/protocol', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/selectors/protocol')>();
  return { ...actual, getCodebook: () => mockCodebook };
});

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

// eslint-disable-next-line import/first -- must follow the vi.mock calls above
import EdgeConfiguration from '../EdgeConfiguration';

const edge = (type: string, ...variables: string[]) => ({
  id: `edge-${type}`,
  subject: { entity: 'edge' as const, type },
  form: { fields: variables.map((variable) => ({ variable })) },
});

const renderSection = (edges: ReturnType<typeof edge>[]) =>
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

const attributesFor = (type: string) =>
  screen.getByTestId(`attributes-${type}`).textContent;

const savedEdges = (values: Record<string, unknown>) =>
  values.edges as
    | {
        subject: { type: string };
        form?: { fields?: { variable: string }[] };
      }[]
    | undefined;

describe('EdgeConfiguration edge-type identity', () => {
  it('keeps the surviving edge type’s attributes when the first of two is removed', async () => {
    const { getFormValues } = renderSection([
      edge('knows', 'knows-1'),
      edge('likes', 'likes-1'),
    ]);

    expect(screen.getAllByTestId('attributes-list')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Remove knows' }));

    await waitFor(() =>
      expect(screen.getAllByTestId('attributes-list')).toHaveLength(1),
    );

    // Regression: the blocks are React-keyed by the edge's own id but register
    // their attribute list at a POSITIONAL name (`edges[N].form.fields`).
    // Removing the first edge type re-indexes the survivor from
    // `edges[1].form.fields` to `edges[0].form.fields`; the removed block's
    // unmount parks its own value dormant under that very name first (React
    // runs a commit's deletion cleanups before its effect bodies), and
    // `registerField` prefers a dormant value over `initialValue` — so the
    // survivor adopted the REMOVED edge type's attributes, and
    // `getFormValues()` replayed them over the container on save.
    expect(attributesFor('likes')).toBe('likes-1');
    await waitFor(() =>
      expect(savedEdges(getFormValues())).toEqual([
        {
          id: 'edge-likes',
          subject: { entity: 'edge', type: 'likes' },
          form: { fields: [{ variable: 'likes-1' }] },
        },
      ]),
    );
  });

  it('keeps both survivors intact when a middle edge type is removed', async () => {
    const { getFormValues } = renderSection([
      edge('knows', 'knows-1'),
      edge('likes', 'likes-1'),
      edge('trusts', 'trusts-1'),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove likes' }));

    await waitFor(() =>
      expect(screen.getAllByTestId('attributes-list')).toHaveLength(2),
    );

    expect(attributesFor('knows')).toBe('knows-1');
    expect(attributesFor('trusts')).toBe('trusts-1');
    await waitFor(() =>
      expect(
        savedEdges(getFormValues())?.map((entry) => [
          entry.subject.type,
          entry.form?.fields?.map((field) => field.variable),
        ]),
      ).toEqual([
        ['knows', ['knows-1']],
        ['trusts', ['trusts-1']],
      ]),
    );
  });

  it('keeps the surviving edge type’s attributes when the last of two is removed', async () => {
    const { getFormValues } = renderSection([
      edge('knows', 'knows-1'),
      edge('likes', 'likes-1'),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove likes' }));

    await waitFor(() =>
      expect(screen.getAllByTestId('attributes-list')).toHaveLength(1),
    );

    expect(attributesFor('knows')).toBe('knows-1');
    await waitFor(() =>
      expect(
        savedEdges(getFormValues())?.map((entry) => [
          entry.subject.type,
          entry.form?.fields?.map((field) => field.variable),
        ]),
      ).toEqual([['knows', ['knows-1']]]),
    );
  });

  it('keeps an unsaved attribute edit with its own edge type when another is removed', async () => {
    const { getFormValues } = renderSection([
      edge('knows', 'knows-1'),
      edge('likes', 'likes-1'),
    ]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Add attribute to likes' }),
    );
    await waitFor(() =>
      expect(attributesFor('likes')).toBe('likes-1,likes-added'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove knows' }));
    await waitFor(() =>
      expect(screen.getAllByTestId('attributes-list')).toHaveLength(1),
    );

    expect(attributesFor('likes')).toBe('likes-1,likes-added');
    await waitFor(() =>
      expect(
        savedEdges(getFormValues())?.map((entry) => [
          entry.subject.type,
          entry.form?.fields?.map((field) => field.variable),
        ]),
      ).toEqual([['likes', ['likes-1', 'likes-added']]]),
    );
  });

  it('never records an edge entry without its type on the undo timeline', async () => {
    const { snapshots } = renderSection([
      edge('knows', 'knows-1'),
      edge('likes', 'likes-1'),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove knows' }));
    await waitFor(() =>
      expect(screen.getAllByTestId('attributes-list')).toHaveLength(1),
    );

    // A structural array write snapshots SYNCHRONOUSLY (StageFormBridge), i.e.
    // before the attribute blocks have re-registered. With the lists held as
    // per-index leaves, the survivor was still registered at
    // `edges[1].form.fields` while the container held one entry, so
    // `getFormValues()` replayed that leaf onto a one-element array and
    // invented a second edge with neither `id` nor `subject` — a stage
    // `networkComposerStage.edges` rejects outright, recorded on the timeline
    // and restored into the live form by the next undo.
    for (const snapshot of snapshots) {
      for (const entry of savedEdges(
        snapshot as unknown as Record<string, unknown>,
      ) ?? []) {
        expect(entry).toMatchObject({
          id: expect.any(String) as unknown as string,
          subject: { entity: 'edge', type: expect.any(String) as string },
        });
      }
    }
  });

  it('restores both edge types with their own attributes when the removal is undone', async () => {
    const { getFormValues, getHistory } = renderSection([
      edge('knows', 'knows-1'),
      edge('likes', 'likes-1'),
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove knows' }));
    await waitFor(() =>
      expect(screen.getAllByTestId('attributes-list')).toHaveLength(1),
    );

    act(() => getHistory().undo());

    await waitFor(() =>
      expect(screen.getAllByTestId('attributes-list')).toHaveLength(2),
    );
    expect(attributesFor('knows')).toBe('knows-1');
    expect(attributesFor('likes')).toBe('likes-1');
    await waitFor(() =>
      expect(
        savedEdges(getFormValues())?.map((entry) => [
          entry.subject.type,
          entry.form?.fields?.map((field) => field.variable),
        ]),
      ).toEqual([
        ['knows', ['knows-1']],
        ['likes', ['likes-1']],
      ]),
    );

    // The removal is one logical change, so redoing it lands back on the
    // surviving edge type alone — with its OWN attributes.
    act(() => getHistory().redo());

    await waitFor(() =>
      expect(screen.getAllByTestId('attributes-list')).toHaveLength(1),
    );
    expect(attributesFor('likes')).toBe('likes-1');
    await waitFor(() =>
      expect(
        savedEdges(getFormValues())?.map((entry) => [
          entry.subject.type,
          entry.form?.fields?.map((field) => field.variable),
        ]),
      ).toEqual([['likes', ['likes-1']]]),
    );
  });
});
