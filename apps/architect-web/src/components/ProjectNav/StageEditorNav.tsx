import { Check, Eye, Loader2, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
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
  const shouldReduceMotion = useReducedMotion();
  const layout = !shouldReduceMotion;

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
        <motion.div
          layout={layout}
          className="flex items-center gap-(--space-sm)"
        >
          <Issues ref={issuesRef} />
          <Button onClick={onCancel} color="platinum" icon={<X />}>
            Cancel
          </Button>
          <AnimatePresence initial={false}>
            {hasUnsavedChanges && (
              <motion.div
                key="finished-editing"
                layout={layout}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                transition={{ duration: 0.18 }}
              >
                <Button
                  type="submit"
                  color="sea-green"
                  icon={<Check />}
                  onClick={() => issuesRef.current?.open()}
                >
                  Finished Editing
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        <motion.div
          layout={layout}
          className="ml-(--space-md) flex items-center gap-(--space-sm)"
        >
          <Tooltip content={previewTooltip}>
            <Button
              onClick={onPreview}
              color="neon-coral"
              icon={
                isOpeningPreview ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Eye />
                )
              }
              disabled={isOpeningPreview || isStageInvalid}
            >
              Preview
            </Button>
          </Tooltip>
          {previewOptions}
        </motion.div>
      </ActionToolbar>
    </>
  );
};

export default StageEditorNav;
