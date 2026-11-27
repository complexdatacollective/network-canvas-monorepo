import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sociogramLayout } from '../../editors/sociogram/sections/SociogramLayoutSection.tsx';
import {
  attributeField,
  attributeSearchBox,
  findCreateRow,
  inventAttribute,
  openAttributePicker,
} from '../../testing/attributePicker.ts';
import { fixtureStageId } from '../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../testing/renderStageEditor.tsx';

const Layout = sociogramLayout();

const openLayoutSection = () =>
  renderStageEditor({
    stageId: fixtureStageId('sociogram-1'),
    sections: <Layout />,
  });

describe('the layout picker', () => {
  it('creates a layout whose name clashes with no node variable across types', async () => {
    const harness = openLayoutSection();
    const field = await waitFor(() => attributeField('Layout'));

    // `fm_name` is an attribute of the family member type, which this
    // sociogram is not about. A layout belongs to the codebook, so the name is
    // refused all the same.
    const popup = await openAttributePicker(harness.user, field);
    await harness.user.type(attributeSearchBox(popup), 'fm_name');
    await waitFor(() =>
      expect(findCreateRow(popup)).toHaveAttribute(
        'data-create-state',
        'invalid',
      ),
    );
    expect(findCreateRow(popup)).toHaveAttribute('aria-disabled', 'true');
    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

    await inventAttribute(harness.user, field, 'seating');
    await waitFor(() =>
      expect(
        within(attributeField('Layout')).getByText('seating'),
      ).toBeInTheDocument(),
    );
    const saved = await harness.submit();
    const created = Object.entries(harness.hostCodebook().layouts ?? {}).find(
      ([, layout]) => layout.name === 'seating',
    )?.[0];
    expect(created).toBeDefined();
    expect(saved?.stageDocument.layout).toBe(created);
    for (const type of Object.values(harness.hostCodebook().node ?? {})) {
      expect(
        Object.values(type.variables ?? {}).map(({ name }) => name),
      ).not.toContain('seating');
    }
  });

  it('draws every layout, in its list and as the held choice, with the layout mark', async () => {
    const harness = openLayoutSection();
    const field = await waitFor(() => attributeField('Layout'));

    expect(field.querySelector('data')).toHaveAttribute(
      'data-attribute-type',
      'layout',
    );
    const popup = await openAttributePicker(harness.user, field);
    const rows = within(popup).getAllByRole('option');
    const layoutRows = rows.filter(
      (row) => row.dataset.attributeId !== undefined,
    );
    expect(layoutRows.length).toBeGreaterThan(0);
    for (const row of layoutRows) {
      expect(row).toHaveAttribute('data-attribute-type', 'layout');
    }
  });
});
