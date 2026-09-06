import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResourceGatewayProvider } from '../../../resources/context.tsx';
import type { ProtocolBuilderResourceGateway } from '../../../resources/gateway.ts';
import {
  InMemoryResourceGateway,
  type InMemoryResourceSeed,
} from '../../../resources/InMemoryResourceGateway.ts';
import FeaturePropertyField from '../FeaturePropertyField.tsx';

const REGIONS = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'Bushwick', tract: '0435' },
      geometry: { type: 'Point', coordinates: [0, 0] },
    },
    {
      type: 'Feature',
      properties: { name: 'Ridgewood', tract: '0511' },
      geometry: { type: 'Point', coordinates: [1, 1] },
    },
  ],
};

const layer = (id: string, body: unknown): InMemoryResourceSeed => ({
  kind: 'geojson',
  id,
  name: id,
  source: `${id}.geojson`,
  contentType: 'application/geo+json',
  bytes: new TextEncoder().encode(
    typeof body === 'string' ? body : JSON.stringify(body),
  ),
});

const gateway = () =>
  new InMemoryResourceGateway({
    committed: [
      layer('regions', REGIONS),
      layer('unreadable', 'not geojson at all'),
      layer('bare', { type: 'FeatureCollection', features: [] }),
    ],
  });

const renderField = (
  props: Partial<Parameters<typeof FeaturePropertyField>[0]> = {},
  resourceGateway: ProtocolBuilderResourceGateway = gateway(),
) => {
  const onChange = vi.fn();
  const view = render(
    <ResourceGatewayProvider gateway={resourceGateway}>
      <FeaturePropertyField
        name="mapOptions.targetFeatureProperty"
        dataSourceAssetId="regions"
        aria-labelledby="recorded-property"
        onChange={onChange}
        {...props}
      />
    </ResourceGatewayProvider>,
  );
  return { ...view, onChange, user: userEvent.setup() };
};

const chooser = () => screen.getByRole('combobox');

/**
 * The properties on offer, without the select's own "choose something"
 * placeholder — which is presentation, not a property of the layer.
 */
const offered = (): string[] =>
  within(chooser())
    .getAllByRole('option')
    .filter((option) => (option.getAttribute('value') ?? '') !== '')
    .map((option) => option.textContent ?? '');

describe('the property a map selection is recorded as', () => {
  it('offers the properties the chosen layer actually carries', async () => {
    renderField();

    await waitFor(() => expect(chooser()).toBeInTheDocument());
    expect(offered()).toEqual(['name', 'tract']);
  });

  it('reports the property the researcher chose', async () => {
    const { user, onChange } = renderField();
    await waitFor(() => expect(chooser()).toBeInTheDocument());

    await user.selectOptions(chooser(), 'tract');

    expect(onChange).toHaveBeenCalledWith('tract');
  });

  /**
   * Blanking a stale reference would hide the very mismatch the researcher has
   * to resolve, and would then save the blank over it.
   */
  it('keeps a stored property this layer does not have, and says so', async () => {
    renderField({ value: 'postcode' });

    await waitFor(() => expect(chooser()).toBeInTheDocument());
    expect(offered()).toEqual([
      'name',
      'tract',
      'postcode — this property is not in the chosen layer',
    ]);
    expect(
      screen.getByText(
        'This property is not in the chosen map layer. Choose one that is.',
      ),
    ).toBeInTheDocument();
  });

  it('asks for a layer before a property', async () => {
    renderField({ dataSourceAssetId: undefined });

    expect(
      await screen.findByText(
        'Choose a map layer first. Its features are where these properties come from.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('says when the layer cannot be read as GeoJSON', async () => {
    renderField({ dataSourceAssetId: 'unreadable' });

    expect(
      await screen.findByText(
        'This layer could not be read as GeoJSON, so its properties cannot be listed.',
      ),
    ).toBeInTheDocument();
  });

  it('says when the layer’s features carry nothing to record', async () => {
    renderField({ dataSourceAssetId: 'bare' });

    expect(
      await screen.findByText(
        'The features in this layer carry no properties, so there is nothing to record a selection as. Choose a layer whose features are labeled.',
      ),
    ).toBeInTheDocument();
  });

  it('drops the previous layer’s properties as soon as another is chosen', async () => {
    const { rerender } = renderField();
    const resourceGateway = gateway();
    await waitFor(() => expect(chooser()).toBeInTheDocument());

    rerender(
      <ResourceGatewayProvider gateway={resourceGateway}>
        <FeaturePropertyField
          name="mapOptions.targetFeatureProperty"
          dataSourceAssetId="bare"
          aria-labelledby="recorded-property"
        />
      </ResourceGatewayProvider>,
    );

    // Not "name and tract until the new layer arrives": those belong to a
    // layer this stage no longer uses.
    await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
  });

  it('offers a retry when the layer could not be fetched', async () => {
    const failing = gateway();
    failing.failNext('download');
    const { user } = renderField({}, failing);

    const retry = await screen.findByRole('button', {
      name: 'Try reading the map layer again',
    });
    await user.click(retry);

    await waitFor(() => expect(chooser()).toBeInTheDocument());
    expect(offered()).toEqual(['name', 'tract']);
  });
});
