import type { Meta, StoryObj } from '@storybook/react-vite';

import { SyntheticInterview } from '@codaco/protocol-utilities';
import CaptureStory, {
  type CaptureParameters,
} from '~/.storybook/CaptureStory';

/**
 * Screenshot-capture story for the NameGeneratorRoster interface. Consumed by
 * the @codaco/interface-images generation pipeline; tune the synthetic data
 * here to change the published screenshots.
 */
const build = () => {
  const si = new SyntheticInterview(1);
  const nodeType = si.addNodeType({ name: 'Person' });
  const nameVar = nodeType.addVariable({ name: 'name', type: 'text' });
  const ageVar = nodeType.addVariable({ name: 'age', type: 'number' });
  const locationVar = nodeType.addVariable({ name: 'location', type: 'text' });

  si.addInformationStage({ title: 'Welcome', text: 'Before the main stage.' });
  const stage = si.addStage('NameGeneratorRoster', {
    label: 'Select People',
    initialNodes: { count: 4 },
    subject: { entity: 'node', type: nodeType.id },
    dataSource: 'externalData',
    cardOptions: {
      displayLabel: nameVar.id,
      additionalProperties: [
        { label: 'Age', variable: ageVar.id },
        { label: 'Location', variable: locationVar.id },
      ],
    },
    sortOptions: {
      sortOrder: [{ property: nameVar.id, direction: 'asc' }],
      sortableProperties: [
        { variable: nameVar.id, label: 'Name' },
        { variable: ageVar.id, label: 'Age' },
        { variable: locationVar.id, label: 'Location' },
      ],
    },
    searchOptions: {
      fuzziness: 0.6,
      matchProperties: [nameVar.id, locationVar.id],
    },
  });
  stage.addPrompt({
    text: 'Which of these people have you interacted with in the past month?',
  });
  si.addAsset({
    key: 'asset-external-data',
    assetId: 'externalData',
    name: 'External Data',
    type: 'network',
    url: '/storybook/roster-100.json',
    size: 0,
  });
  si.addInformationStage({ title: 'Complete', text: 'After the main stage.' });
  return si;
};

const meta: Meta = {
  title: 'Capture/NameGeneratorRoster',
  tags: ['capture'],
  parameters: {
    layout: 'fullscreen',
    capture: { interface: 'NameGeneratorRoster' } satisfies CaptureParameters,
  },
};

export default meta;

export const Capture: StoryObj = {
  render: () => <CaptureStory build={build} />,
};
