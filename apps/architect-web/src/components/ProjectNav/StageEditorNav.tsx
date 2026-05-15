import { Check, Eye, Loader2, X } from 'lucide-react';
import { type ReactNode, useRef } from 'react';
import { useSelector } from 'react-redux';

import Issues, { type IssuesHandle } from '~/components/Issues';
import Tooltip from '~/components/NewComponents/Tooltip';
import { Button } from '~/lib/legacy-ui/components';
import { getProtocolName } from '~/selectors/protocol';

import ActionToolbar from './ActionToolbar';
import Breadcrumb, { type BreadcrumbItem } from './Breadcrumb';
import NavShell from './NavShell';

type StageEditorNavProps = {
  stageName: string;
  onCancel: () => void;
  onPreview: () => void;
  previewLabel: string;
  previewOptions?: ReactNode;
  isStageInvalid: boolean;
  isOpeningPreview: boolean;
  hasUnsavedChanges: boolean;
};

const StageEditorNav = ({
  stageName,
  onCancel,
  onPreview,
  previewLabel,
  previewOptions,
  isStageInvalid,
  isOpeningPreview,
  hasUnsavedChanges,
}: StageEditorNavProps) => {
  const protocolName = useSelector(getProtocolName);
  const issuesRef = useRef<IssuesHandle>(null);

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: protocolName ?? 'Untitled protocol', onClick: onCancel },
    { label: stageName },
  ];

  const previewTooltip = isStageInvalid
    ? 'Previewing requires valid stage configuration. Fix the errors on this stage to enable previewing.'
    : isOpeningPreview
      ? previewLabel
      : 'Open this stage in a new tab to preview how it will appear to participants.';

  return (
    <>
      <NavShell leading={<Breadcrumb items={breadcrumbItems} />} />
      <ActionToolbar aria-label="Stage editor actions">
        <Issues ref={issuesRef} />
        <Button onClick={onCancel} color="platinum" icon={<X />}>
          Cancel
        </Button>
        {previewOptions}
        <Tooltip content={previewTooltip}>
          <Button
            onClick={onPreview}
            color="neon-coral"
            icon={
              isOpeningPreview ? <Loader2 className="animate-spin" /> : <Eye />
            }
            disabled={isOpeningPreview || isStageInvalid}
          >
            Preview
          </Button>
        </Tooltip>
        {hasUnsavedChanges && (
          <Button
            type="submit"
            color="sea-green"
            icon={<Check />}
            onClick={() => issuesRef.current?.open()}
          >
            Finished Editing
          </Button>
        )}
      </ActionToolbar>
    </>
  );
};

export default StageEditorNav;
