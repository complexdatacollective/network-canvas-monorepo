import { ArrowLeft, FlaskConical } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useLocation } from 'wouter';

import Button from '@codaco/fresco-ui/Button';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import type { ToolbarSegment } from '@codaco/fresco-ui/SegmentedToolbar';
import Heading from '@codaco/fresco-ui/typography/Heading';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Layout } from '~/components/EditorLayout';
import ActionToolbar from '~/components/ProjectNav/ActionToolbar';
import { useAppDispatch } from '~/ducks/hooks';
import { actionCreators } from '~/ducks/modules/activeProtocol';
import { getExperiments, getProtocol } from '~/selectors/protocol';
import { cx } from '~/utils/cva';
const ExperimentsPage = () => {
  const [, setLocation] = useLocation();
  const dispatch = useAppDispatch();
  const protocol = useSelector(getProtocol);
  const experiments = useSelector(getExperiments) ?? {};
  const handleGoBack = () => {
    setLocation('/protocol');
  };
  const handleToggleExperiment = (key: string, checked: boolean) => {
    dispatch(
      actionCreators.updateProtocol({
        experiments: { ...experiments, [key]: checked },
      }),
    );
  };
  if (!protocol) {
    return (
      <Layout>
        <div className="flex h-full flex-col items-center justify-center gap-4">
          <Paragraph>
            No protocol loaded. Please open a protocol first.
          </Paragraph>
          <Button onClick={() => setLocation('/')} color="default">
            Go Home
          </Button>
        </div>
      </Layout>
    );
  }
  const isEncryptedEnabled = experiments.encryptedVariables ?? false;
  const toolbarItems: ToolbarSegment[] = [
    {
      type: 'button',
      id: 'go-back',
      label: 'Go Back',
      icon: <ArrowLeft />,
      showLabel: true,
      onClick: handleGoBack,
    },
  ];
  return (
    <div className="relative h-full overflow-y-auto pb-32 print:h-auto print:overflow-visible print:pb-0">
      <Layout>
        <div className="phone-landscape:px-7 tablet-landscape:px-29 mx-auto my-10 flex max-w-7xl flex-col gap-6 px-5">
          <div className="flex flex-col">
            <div className="flex items-center gap-3">
              <div className="bg-mustard/20 rounded-lg p-2">
                <FlaskConical className="text-mustard h-6 w-6" />
              </div>
              <Heading level="h1">Experimental Features</Heading>
            </div>
            <Paragraph>
              These features are experimental and may not be fully supported.
            </Paragraph>
          </div>

          <div className="flex flex-col gap-4">
            <div
              className={cx(
                'flex items-center gap-4 rounded border border-transparent p-4 transition-colors',
                isEncryptedEnabled
                  ? 'border-sea-green/50 bg-sea-green/10'
                  : 'bg-surface-1',
              )}
            >
              <div className="min-w-0 flex-1">
                <Heading level="h4">Encrypted Variables</Heading>
                <Paragraph className="text-muted text-sm">
                  Enable support for encrypted variables in the codebook. This
                  allows sensitive data to be collected securely.
                </Paragraph>
              </div>
              <ToggleField
                value={isEncryptedEnabled}
                onChange={(checked) =>
                  handleToggleExperiment('encryptedVariables', !!checked)
                }
              />
            </div>
          </div>
        </div>
      </Layout>
      <ActionToolbar aria-label="Experiments actions" items={toolbarItems} />
    </div>
  );
};
export default ExperimentsPage;
