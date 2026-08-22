import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

const confirm = vi.fn();

vi.mock('@codaco/fresco-ui/dialogs/useDialog', () => ({
  default: () => ({ confirm }),
}));

import MinMaxAlterLimits from '../../MinMaxAlterLimits';
import SyntheticData from '../SyntheticData';

/**
 * What the section ANALYSES while a researcher edits: the committed stage with
 * the form's own values over it.
 *
 * The merge exists because `getFormValues()` reports REGISTERED fields only,
 * and a stage editor legitimately has sections whose fields are unmounted —
 * so reading values alone would lose the very siblings the schema resolves a
 * count against. The risk it carries is the mirror image: a key the researcher
 * has just REMOVED is unregistered too, and a merge that could not tell the
 * two apart would go on analysing a stage the save would never produce.
 *
 * This is that case, driven through the real toggle rather than asserted about
 * in the abstract. The count window is the observable because it is derived
 * from the same draft the feasibility document is built from — a window still
 * quoting the removed limits is a draft still carrying them.
 */

const STAGE = {
  id: 'stage-1',
  type: 'NameGenerator',
  label: 'Name some people',
  subject: { entity: 'node', type: 'person' },
  form: { title: 'Add person', fields: [{ variable: 'name', prompt: 'Name' }] },
  prompts: [{ id: 'prompt-1', text: 'Who do you know?' }],
  behaviours: { minNodes: 5, maxNodes: 5 },
};

const CODEBOOK = {
  node: {
    person: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: { name: { name: 'Name', type: 'text', component: 'Text' } },
    },
  },
  edge: {},
  ego: { variables: {} },
};

const STAGE_PROPS = {
  stagePath: 'stages[0]',
  stagePosition: 0,
  interfaceType: 'NameGenerator' as const,
};

const setup = () => {
  const committedStage = asStage(STAGE);
  return renderStageForm({
    committedStage,
    extraReducers: {
      activeProtocol: () => ({
        present: {
          name: 'Test protocol',
          schemaVersion: 8,
          codebook: CODEBOOK,
          assetManifest: {},
          stages: [committedStage],
        },
      }),
    },
    children: (
      <>
        <MinMaxAlterLimits {...STAGE_PROPS} />
        <SyntheticData {...STAGE_PROPS} />
      </>
    ),
  });
};

const disclosure = () =>
  screen
    .getAllByRole('button')
    .find((button) => button.hasAttribute('aria-expanded'));

describe('the stage the section analyses', () => {
  beforeEach(() => {
    confirm.mockReset();
    confirm.mockImplementation(
      async ({ onConfirm }: { onConfirm?: () => void }) => {
        onConfirm?.();
        return true;
      },
    );
  });

  it('resolves the count inside the limits the stage carries', () => {
    setup();

    // Pinned at five people, so the schema's default mean is held there.
    expect(disclosure()).toHaveTextContent('Nodes: normal(mean 5, sd 3)');
  });

  it('drops a limit the researcher has just removed', async () => {
    const { getFormValues } = setup();

    fireEvent.click(screen.getByRole('switch', { name: 'Min/max alters' }));

    await waitFor(() => {
      expect(
        screen.queryByLabelText(/Minimum Number of Alters/),
      ).not.toBeInTheDocument();
    });

    // What a save would commit: no limits at all.
    expect(
      (getFormValues().behaviours as Record<string, unknown> | undefined)
        ?.minNodes,
    ).toBeUndefined();
    // And what the section analyses says the same thing — the count is
    // resolved over the whole population window again.
    expect(disclosure()).toHaveTextContent('Nodes: normal(mean 8, sd 3)');
  });
});
