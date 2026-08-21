import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PANEL_NOMINATION_PROBABILITY } from '@codaco/protocol-validation';
import { HiddenFieldValue } from '~/components/sections/Form/withFieldsHandlers';
import {
  asStage,
  renderStageForm,
} from '~/components/StageEditor/__tests__/stageFormTestHarness';

import { PanelSyntheticSection } from '../PanelSyntheticSection';

/**
 * The NodePanel's synthetic control. The panel's block is registered by
 * `NodePanels` (a hidden field per slot, so it survives the row churn a delete
 * or reorder puts the list through), which the harness below stands in for —
 * this section reads and writes that one field rather than a leaf of it.
 */

const FIELD_NAME = 'panels[0]';

const setup = (synthetic?: Record<string, unknown>) =>
  renderStageForm({
    committedStage: asStage({
      id: 'stage-1',
      type: 'NameGenerator',
      panels: [
        {
          id: 'panel-1',
          title: 'People you named',
          dataSource: 'existing',
          ...(synthetic === undefined ? {} : { synthetic }),
        },
      ],
    }),
    children: (
      <>
        <HiddenFieldValue
          name={`${FIELD_NAME}.synthetic`}
          initialValue={synthetic}
        />
        <PanelSyntheticSection fieldName={FIELD_NAME} />
      </>
    ),
  });

const disclosure = () => {
  const triggers = screen
    .getAllByRole('button')
    .filter((button) => button.hasAttribute('aria-expanded'));
  expect(triggers).toHaveLength(1);
  return triggers[0]!;
};

const panelSynthetic = (getFormValues: () => Record<string, unknown>) => {
  const panels = getFormValues().panels as
    | { synthetic?: unknown }[]
    | undefined;
  return panels?.[0]?.synthetic;
};

describe('PanelSyntheticSection', () => {
  it('summarises the schema’s own default as a percentage, unauthored', () => {
    const { getFormValues } = setup();

    const row = disclosure();
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(row).toHaveTextContent('Nomination probability: 30%');
    expect(within(row).getByText('Default')).toBeInTheDocument();
    expect(panelSynthetic(getFormValues)).toBeUndefined();
    // The summary is the schema's number, not a literal restated in the test.
    expect(DEFAULT_PANEL_NOMINATION_PROBABILITY).toBe(0.3);
  });

  it('shows an authored probability and marks the block authored', () => {
    const { getFormValues } = setup({ nominationProbability: 0.75 });

    const row = disclosure();
    expect(row).toHaveTextContent('Nomination probability: 75%');
    expect(within(row).getByText('Authored')).toBeInTheDocument();
    expect(panelSynthetic(getFormValues)).toEqual({
      nominationProbability: 0.75,
    });
  });

  it('writes the block when the probability is edited', () => {
    const { getFormValues } = setup();
    fireEvent.click(disclosure());

    fireEvent.change(screen.getByLabelText('Nomination probability'), {
      target: { value: '0.6' },
    });

    expect(panelSynthetic(getFormValues)).toEqual({
      nominationProbability: 0.6,
    });
    expect(disclosure()).toHaveTextContent('Nomination probability: 60%');
  });

  it('holds the probability inside its 0–1 domain', () => {
    const { getFormValues } = setup();
    fireEvent.click(disclosure());

    const input = screen.getByLabelText('Nomination probability');
    expect(input).toHaveAttribute('min', '0');
    expect(input).toHaveAttribute('max', '1');

    fireEvent.change(input, { target: { value: '4' } });

    // Refused rather than clamped: writing 1 would store odds nobody chose,
    // and leave the box agreeing with them. The entry stays on screen instead,
    // and nothing is written until it is one the domain admits.
    expect(input).toHaveValue(4);
    expect(panelSynthetic(getFormValues)).toBeUndefined();

    fireEvent.change(input, { target: { value: '0.4' } });
    expect(panelSynthetic(getFormValues)).toEqual({
      nominationProbability: 0.4,
    });
  });

  it('removes the block on reset', () => {
    const { getFormValues } = setup({ nominationProbability: 0.75 });

    fireEvent.click(screen.getByRole('button', { name: /Reset to default/i }));

    expect(panelSynthetic(getFormValues)).toBeUndefined();
    expect(within(disclosure()).getByText('Default')).toBeInTheDocument();
    expect(disclosure()).toHaveTextContent('Nomination probability: 30%');
  });
});
