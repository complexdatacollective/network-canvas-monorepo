import { configureStore } from '@reduxjs/toolkit';
import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';

import { fixtureStageIds } from '@codaco/protocol-builder/testing/protocolFixture';
import { renderStageEditor } from '@codaco/protocol-builder/testing/renderStageEditor';
import type { RootState } from '~/ducks/store';

import { StageEditorHeader } from '../StageEditorChrome';

/**
 * Where the stage sits in the interview, over the chrome that actually says
 * it.
 *
 * The title is drawn by the package's editor harness through the header slot —
 * the same slot the route uses — and the position comes from this tab's Redux
 * store, so both have to be there. The Redux provider is mounted INSIDE the
 * slot because the harness owns the render; nothing about the chrome cares
 * where in the tree the store arrived from.
 *
 * Every expectation is derived from the stage order the store is built with,
 * which is the fixture protocol the editor is opened on — so a header that had
 * stopped reading the order, or that read it one place out, disagrees with the
 * protocol rather than with a number written down here.
 */
const ORDER = fixtureStageIds();

const storeWithStages = (stages: readonly string[] | null) =>
  configureStore({
    reducer: () =>
      ({
        activeProtocol:
          stages === null
            ? undefined
            : { present: { stages: stages.map((id) => ({ id })) } },
      }) as unknown as RootState,
  });

const inTheRoute = (header: ReactNode, stages: readonly string[] | null) =>
  ({
    sections: <></>,
    header: () => <Provider store={storeWithStages(stages)}>{header}</Provider>,
  }) as const;

describe('where the stage sits in the interview', () => {
  it.each(ORDER)('says where %s is, counting from the protocol', (stageId) => {
    renderStageEditor({
      stageId,
      ...inTheRoute(<StageEditorHeader stageId={stageId} />, ORDER),
    });

    expect(
      screen.getByText(
        `Stage ${ORDER.indexOf(stageId) + 1} of ${ORDER.length}`,
      ),
      stageId,
    ).toBeInTheDocument();
  });

  /**
   * Three ways there is no place to state, and all three have to answer the
   * same way: a header that filled one of them in would be telling a
   * researcher the stage is somewhere it is not.
   *
   * The title itself is asserted present in each, so "no position" is the
   * absence of the line rather than the absence of the whole component.
   */
  it('states no position for a stage the interview does not hold yet', () => {
    renderStageEditor({
      create: { type: 'Information', position: 2 },
      ...inTheRoute(<StageEditorHeader stageId={null} />, ORDER),
    });

    expect(
      screen.getByRole('textbox', { name: 'Stage name' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Stage \d+ of \d+$/)).toBeNull();
  });

  it('states no position while the protocol has not loaded', () => {
    renderStageEditor({
      stageId: 'information-1',
      ...inTheRoute(<StageEditorHeader stageId="information-1" />, null),
    });

    expect(
      screen.getByRole('textbox', { name: 'Stage name' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Stage \d+ of \d+$/)).toBeNull();
  });

  it('states no position for a stage the order does not list', () => {
    renderStageEditor({
      stageId: 'information-1',
      // A stage id the loaded protocol has no place for — what the route holds
      // for the moment between a collaborator deleting the stage and the
      // redirect that follows.
      ...inTheRoute(
        <StageEditorHeader stageId="a-stage-that-was-deleted" />,
        ORDER,
      ),
    });

    expect(
      screen.getByRole('textbox', { name: 'Stage name' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Stage \d+ of \d+$/)).toBeNull();
  });
});
