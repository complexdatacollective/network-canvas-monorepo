'use client';

import { Collapsible } from '@base-ui/react/collapsible';
import type { ReactNode } from 'react';
import { useId } from 'react';

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
    }
  | {
      toggleable?: false;
      defaultOpen?: never;
    };

export type SectionProps = SectionBaseProps & SectionToggleProps;

/**
 * A single-panel form section. Toggleable sections remove their panel from the
 * DOM while closed, allowing Fresco form fields to unregister on unmount.
 */
export default function Section({
  title,
  description,
  toggleable = false,
  defaultOpen = true,
  disabled = false,
  children,
}: SectionProps) {
  const titleId = useId();
  const descriptionId = useId();
  const hasDescription = description !== undefined && description !== null;
  const surfaceDepth = useSurfaceDepth();
  const headingLevel = surfaceDepth === 0 ? 'h3' : 'h4';

  return (
    <Collapsible.Root
      open={toggleable ? undefined : true}
      defaultOpen={toggleable ? defaultOpen : undefined}
      disabled={disabled}
      className="w-full"
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
              aria-labelledby={titleId}
              aria-describedby={hasDescription ? descriptionId : undefined}
              render={(triggerProps, state) => (
                <Toggle
                  {...triggerProps}
                  checked={state.open}
                  disabled={state.disabled}
                  size="md"
                  className="shrink-0"
                />
              )}
            />
          )}
        </header>

        <Collapsible.Panel className="h-(--collapsible-panel-height) overflow-hidden border-t border-current/10 opacity-100 transition-[height,opacity] duration-200 data-[ending-style]:h-0 data-[ending-style]:opacity-0 data-[starting-style]:h-0 data-[starting-style]:opacity-0">
          <fieldset
            disabled={disabled}
            className="m-0 min-w-0 border-0 p-6 disabled:opacity-60"
          >
            {children}
          </fieldset>
        </Collapsible.Panel>
      </Surface>
    </Collapsible.Root>
  );
}
