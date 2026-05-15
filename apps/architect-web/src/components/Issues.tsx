import { map } from 'es-toolkit/compat';
import { TriangleAlert } from 'lucide-react';
import type React from 'react';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import { getFormSyncErrors, hasSubmitFailed } from 'redux-form';

import Button from '~/lib/legacy-ui/components/Button';

import { flattenIssues, getFieldId } from '../utils/issues';
import scrollTo from '../utils/scrollTo';
import Popover from './NewComponents/Popover';
import { formName } from './StageEditor/configuration';

export type IssuesHandle = {
  open: () => void;
  hasIssues: boolean;
};

const Issues = forwardRef<IssuesHandle>((_, ref) => {
  const formErrors = useSelector(getFormSyncErrors(formName));
  const submitFailed = useSelector(hasSubmitFailed(formName));
  const issues = formErrors as Record<string, unknown>;
  const flatIssues = useMemo(() => flattenIssues(issues), [issues]);
  const hasIssues = flatIssues.length > 0;
  const issueCount = flatIssues.length;

  const [open, setOpen] = useState(false);
  const issueRefs = useRef<Record<string, HTMLElement | null>>({});

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        if (hasIssues) setOpen(true);
      },
      hasIssues,
    }),
    [hasIssues],
  );

  useEffect(() => {
    if (submitFailed && hasIssues) {
      setOpen(true);
    }
  }, [submitFailed, hasIssues]);

  useEffect(() => {
    if (!hasIssues) setOpen(false);
  }, [hasIssues]);

  const setIssueRef = (el: HTMLElement | null, fieldId: string) => {
    issueRefs.current[fieldId] = el;
  };

  // Field display labels live in the DOM; harvest friendly names from each field's
  // data-name/textContent so the list reads as a label rather than an internal path.
  // `open` is a dep because the issue refs are only mounted while the popover is open.
  useEffect(() => {
    if (!open) return;
    flatIssues.forEach(({ field }: { field: string; issue: string }) => {
      const fieldId = getFieldId(field);
      const targetField = document.querySelector(`#${fieldId}`);
      if (!targetField) return;
      const fieldName =
        targetField.getAttribute('data-name') || targetField.textContent;
      if (fieldName && issueRefs?.current[fieldId]) {
        issueRefs.current[fieldId].textContent = fieldName;
      }
    });
  }, [flatIssues, open]);

  if (!hasIssues || !submitFailed) return null;

  const handleClickIssue = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const link = target.closest('a')?.getAttribute('href');
    if (link) {
      const destination = document.querySelector(link);
      if (destination instanceof HTMLElement) {
        scrollTo(destination);
        setOpen(false);
      }
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      side="top"
      align="start"
      sideOffset={8}
      className="bg-sea-serpent text-primary-foreground max-w-lg min-w-md"
      trigger={
        <Button color="sea-serpent" icon={<TriangleAlert />}>
          Issues ({issueCount})
        </Button>
      }
    >
      <div className="border-sea-serpent-dark/40 flex items-center gap-(--space-md) border-b px-(--space-md) py-3">
        <TriangleAlert className="size-4 shrink-0" aria-hidden />
        <span className="text-sm font-semibold tracking-wider uppercase">
          Issues ({issueCount})
        </span>
      </div>
      <ol className="m-0 list-none overflow-y-auto p-0 [counter-reset:issue]">
        {map(flatIssues, ({ field, issue }) => {
          const fieldId = getFieldId(field);
          return (
            // `issues__issue` marker is preserved for the Issues.test.tsx selector.
            <li
              key={fieldId}
              className="issues__issue hover:bg-sea-serpent-dark m-0 bg-transparent p-0 transition-colors duration-(--animation-duration-standard) ease-(--animation-easing)"
            >
              <a
                href={`#${fieldId}`}
                onClick={handleClickIssue}
                className="text-primary-foreground block w-full px-(--space-md) py-(--space-sm) no-underline before:mr-(--space-sm) before:[content:counter(issue)_'.'] before:[counter-increment:issue]"
              >
                <span ref={(el) => setIssueRef(el, fieldId)}>{field}</span> -{' '}
                {issue}
              </a>
            </li>
          );
        })}
      </ol>
    </Popover>
  );
});

Issues.displayName = 'Issues';

export default Issues;
