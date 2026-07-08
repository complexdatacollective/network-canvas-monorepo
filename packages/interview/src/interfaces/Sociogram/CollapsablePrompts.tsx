import { ChevronUp, GripHorizontal } from 'lucide-react';
import { motion } from 'motion/react';
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useState,
} from 'react';

import usePrevious from '@codaco/fresco-ui/hooks/usePrevious';
import { MotionSurface } from '@codaco/fresco-ui/layout/Surface';
import { cx } from '@codaco/fresco-ui/utils/cva';
import Prompts from '~/components/Prompts';
import { usePrompts } from '~/components/Prompts/usePrompts';

const MotionChevron = motion.create(ChevronUp);

/**
 * Floating, draggable panel showing the current prompt. Collapsible via the
 * chevron tab so the prompt text can be moved out of the way of the canvas;
 * re-opens automatically when the prompt changes so the new task is visible.
 *
 * Pass `collapsible={false}` on stages where the prompt is the participant's
 * core task and must therefore stay visible (e.g. Geospatial).
 */
const CollapsablePrompts = (props: {
  dragConstraints: RefObject<HTMLElement | null>;
  children?: ReactNode;
  className?: string;
  collapsible?: boolean;
}) => {
  const { dragConstraints, children, className, collapsible = true } = props;
  const { prompt } = usePrompts();
  const [collapsed, setCollapsed] = useState(false);
  const contentId = useId();

  const isCollapsed = collapsible && collapsed;

  const promptId = prompt.id;
  const prevPromptId = usePrevious(promptId);
  useEffect(() => {
    if (prevPromptId !== undefined && promptId !== prevPromptId) {
      setCollapsed(false);
    }
  }, [promptId, prevPromptId]);

  return (
    <MotionSurface
      className={cx(
        'bg-surface/80 absolute top-4 right-4 z-10 flex w-fit max-w-sm cursor-move flex-col items-center overflow-hidden border-b-2 shadow-2xl backdrop-blur-md',
        className,
      )}
      layout
      drag
      dragConstraints={dragConstraints}
      noContainer
      spacing="sm"
      shadow="sm"
      variants={{
        initial: {
          scale: 0.4,
          opacity: 0,
        },
        animate: {
          scale: 1,
          opacity: 1,
        },
        exit: {
          scale: 0,
          opacity: 0,
        },
      }}
    >
      <div className="flex w-full items-center justify-between gap-4">
        <GripHorizontal aria-hidden className="size-[1.2em] opacity-50" />
        {collapsible && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            aria-expanded={!collapsed}
            aria-controls={contentId}
            aria-label={collapsed ? 'Show instructions' : 'Hide instructions'}
            className="focusable -m-2 cursor-pointer rounded p-2"
            data-testid="prompts-toggle"
          >
            <MotionChevron
              className="size-[1.2em]"
              animate={{ rotate: collapsed ? 180 : 0 }}
            />
          </button>
        )}
      </div>
      <motion.div
        id={contentId}
        className="w-full overflow-hidden"
        initial={false}
        animate={
          isCollapsed
            ? {
                height: 0,
                opacity: 0,
                transition: {
                  height: { duration: 0.25, ease: [0, 0, 0.2, 1] },
                  opacity: { duration: 0.15 },
                },
              }
            : {
                height: 'auto',
                opacity: 1,
                transition: {
                  height: { type: 'spring', stiffness: 300, damping: 24 },
                  opacity: { duration: 0.15 },
                },
              }
        }
      >
        <div className="flex w-full flex-col items-center gap-4 pt-2">
          <Prompts small />
          {children}
        </div>
      </motion.div>
    </MotionSurface>
  );
};

export default CollapsablePrompts;
