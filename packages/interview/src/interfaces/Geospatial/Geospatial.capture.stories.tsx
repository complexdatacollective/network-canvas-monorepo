import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

// Requires STORYBOOK_MAPBOX_TOKEN env var to be set at storybook build time.
const MAPBOX_TOKEN = import.meta.env.STORYBOOK_MAPBOX_TOKEN as string;

/**
 * Screenshot-capture story for the Geospatial interface. Consumed by the
 * @codaco/interface-images generation pipeline; tune the synthetic data here
 * to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nt = si.addNodeType({ name: 'Person' });

  si.addAsset({
    assetId: 'mapbox-token',
    value: MAPBOX_TOKEN,
  });
  si.addAsset({
    assetId: 'geojson-data',
    url: '/storybook/chicago.geojson',
  });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('Geospatial', {
    initialNodes: { count: 3 },
    mapOptions: {
      tokenAssetId: 'mapbox-token',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-87.6298, 41.8781] as [number, number],
      initialZoom: 10,
      dataSourceAssetId: 'geojson-data',
      color: 'ord-color-seq-1',
      targetFeatureProperty: 'census_tra',
    },
  });
  const locationVar = nt.addVariable({ type: 'text', name: 'Home Location' });
  stage.addPrompt({
    text: 'Where does this person live?',
    variable: locationVar.id,
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/Geospatial',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: {
      interface: 'Geospatial',
      delay: 3000,
      env: ['STORYBOOK_MAPBOX_TOKEN'],
    } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
