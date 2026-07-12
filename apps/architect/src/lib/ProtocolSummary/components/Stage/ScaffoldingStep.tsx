import Heading from '@codaco/fresco-ui/typography/Heading';
import Markdown from '~/components/Markdown';

import MiniTable from '../MiniTable';
type ScaffoldingStepProps = {
  scaffoldingStep?: {
    text: string;
    showQuickStartModal: boolean;
  } | null;
};
const ScaffoldingStep = ({ scaffoldingStep = null }: ScaffoldingStepProps) => {
  if (!scaffoldingStep) {
    return null;
  }
  return (
    <>
      <Heading level="h4">Scaffolding Step Instructions</Heading>
      <Markdown label={scaffoldingStep.text} />
      <MiniTable
        rotated
        rows={[
          [
            'Show Quick Start Modal',
            scaffoldingStep.showQuickStartModal ? 'Yes' : 'No',
          ],
        ]}
      />
    </>
  );
};
export default ScaffoldingStep;
