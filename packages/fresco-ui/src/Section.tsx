'use client';

import { Collapsible } from '@base-ui/react/collapsible';
import type { ReactNode } from 'react';
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { FieldUnmountPolicyProvider } from './form/FieldUnmountPolicy';
import { FormStoreContext } from './form/store/formStoreProvider';
import Surface, { useSurfaceDepth } from './layout/Surface';
import Toggle from './Toggle';
import Heading from './typography/Heading';
import Paragraph from './typography/Paragraph';

type SectionBaseProps = {
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  children?: ReactNode;
};

type SectionToggleProps =
  | {
      toggleable: true;
      defaultOpen?: boolean;
      /** Return false to block the requested open-state change. */
      onOpenChange?: (open: boolean) => boolean | Promise<boolean>;
    }
  | {
      toggleable?: false;
      defaultOpen?: never;
      onOpenChange?: never;
    };

export type SectionProps = SectionBaseProps & SectionToggleProps;

const subscribeToNothing = () => () => {};

/**
 * A single-panel form section. Closing a toggleable section removes its panel
 * from the DOM and clears descendant Fresco field values. The cleared values
 * remain absent when the section is reopened during the same form session.
 */
export default function Section({
  title,
  description,
  toggleable = false,
  defaultOpen = true,
  onOpenChange,
  disabled = false,
  children,
}: SectionProps) {
  const titleId = useId();
  const descriptionId = useId();
  const hasDescription = description !== undefined && description !== null;
  const surfaceDepth = useSurfaceDepth();
  const headingLevel = surfaceDepth === 0 ? 'h3' : 'h4';
  const [open, setOpen] = useState(toggleable ? defaultOpen : true);
  const [isChangePending, setIsChangePending] = useState(false);
  const changePending = useRef(false);
  const discardOnUnmount = useRef(false);
  const formStore = useContext(FormStoreContext);
  const formRestoreVersion = useSyncExternalStore(
    formStore?.subscribe ?? subscribeToNothing,
    () => formStore?.getState().formRestoreVersion ?? 0,
    () => 0,
  );
  const previousFormRestoreVersion = useRef(formRestoreVersion);

  // A form host can restore configuration while this Section remains mounted.
  // Reapply the caller's default for that explicit restore only; ordinary
  // defaultOpen prop changes keep the conventional initial-value semantics
  // and cannot reopen a Section the user deliberately closed.
  useEffect(() => {
    if (
      !toggleable ||
      previousFormRestoreVersion.current === formRestoreVersion
    )
      return;
    previousFormRestoreVersion.current = formRestoreVersion;
    discardOnUnmount.current = false;
    setOpen(defaultOpen);
  }, [defaultOpen, formRestoreVersion, toggleable]);

  const requestOpenChange = useCallback(
    async (nextOpen: boolean) => {
      if (!toggleable || disabled || changePending.current) return;

      changePending.current = true;
      setIsChangePending(true);
      try {
        const requestedChange = onOpenChange?.(nextOpen);
        const permitted =
          requestedChange === undefined || typeof requestedChange === 'boolean'
            ? (requestedChange ?? true)
            : await requestedChange;
        if (!permitted) return;

        discardOnUnmount.current = !nextOpen;
        setOpen(nextOpen);
      } finally {
        changePending.current = false;
        setIsChangePending(false);
      }
    },
    [disabled, onOpenChange, toggleable],
  );

  return (
    <Collapsible.Root
      open={toggleable ? open : true}
      onOpenChange={(nextOpen) => void requestOpenChange(nextOpen)}
      disabled={disabled}
      className="mb-10 w-full last:mb-0"
    >
      <Surface
        as="section"
        noContainer
        spacing="none"
        shadow="sm"
        aria-labelledby={titleId}
        aria-describedby={hasDescription ? descriptionId : undefined}
        aria-disabled={disabled || undefined}
        className="group w-full overflow-visible!"
      >
        <header className="flex items-start justify-between gap-6 p-6">
          <div className="min-w-0 group-aria-disabled:opacity-50">
            <Heading id={titleId} level={headingLevel} margin="none">
              {title}
            </Heading>
            {hasDescription && (
              <Paragraph
                id={descriptionId}
                emphasis="muted"
                className="mt-2 mb-0!"
              >
                {description}
              </Paragraph>
            )}
          </div>

          {toggleable && (
            <Collapsible.Trigger
              aria-busy={isChangePending || undefined}
              aria-labelledby={titleId}
              aria-describedby={hasDescription ? descriptionId : undefined}
              disabled={isChangePending}
              render={(triggerProps, state) => (
                <Toggle
                  {...triggerProps}
                  checked={state.open}
                  disabled={state.disabled || isChangePending}
                  size="md"
                  className="shrink-0"
                />
              )}
            />
          )}
        </header>

        <Collapsible.Panel className="h-(--collapsible-panel-height) overflow-hidden border-t border-current/10 opacity-100 transition-[height,opacity] duration-200 data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0">
          {open && (
            <FieldUnmountPolicyProvider discardOnUnmount={discardOnUnmount}>
              <fieldset
                disabled={disabled}
                className="m-0 min-w-0 border-0 p-6 disabled:opacity-60"
              >
                {children}
              </fieldset>
            </FieldUnmountPolicyProvider>
          )}
        </Collapsible.Panel>
      </Surface>
    </Collapsible.Root>
  );
}
