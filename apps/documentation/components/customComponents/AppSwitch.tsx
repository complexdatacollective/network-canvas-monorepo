'use client';

import { Tabs } from '@base-ui/react/tabs';
import { Globe, Monitor } from 'lucide-react';
import { Children, isValidElement, type ReactNode } from 'react';

import {
  type AppAxis,
  useSelectedApp,
} from '~/components/customComponents/useSelectedApp';
import { cn } from '~/lib/utils';

const ICONS = {
  globe: Globe,
  desktop: Monitor,
} as const;

type AppOptionProps = {
  label: string;
  icon?: keyof typeof ICONS;
  children: ReactNode;
};

export const AppOption = ({ children }: AppOptionProps) => <>{children}</>;

export const AppSwitch = ({
  children,
  axis = 'architect',
}: {
  children: ReactNode;
  axis?: AppAxis;
}) => {
  const [selectedApp, selectApp] = useSelectedApp(axis);

  const options = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => child.props as Partial<AppOptionProps>)
    .filter(
      (props): props is AppOptionProps => typeof props.label === 'string',
    );

  const [firstOption] = options;
  if (!firstOption) {
    return null;
  }

  const activeLabel =
    selectedApp !== null &&
    options.some((option) => option.label === selectedApp)
      ? selectedApp
      : firstOption.label;

  return (
    <Tabs.Root
      value={activeLabel}
      onValueChange={(value) => {
        if (typeof value === 'string') {
          selectApp(value);
        }
      }}
      className="py-8"
    >
      <Tabs.List className="border-accent/15 bg-accent/10 inline-grid w-full auto-cols-fr grid-flow-col gap-1 rounded-xl border p-1">
        {options.map((option, index) => {
          const Icon = option.icon ? ICONS[option.icon] : null;
          return (
            <Tabs.Tab
              key={`${option.label}-${index}`}
              value={option.label}
              className={cn(
                'focusable text-foreground/70 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors',
                'hover:text-foreground hover:bg-accent/20',
                'data-active:bg-accent data-active:text-accent-foreground data-active:hover:bg-accent data-active:shadow-sm',
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden />}
              {option.label}
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
      {options.map((option, index) => (
        <Tabs.Panel
          key={`${option.label}-${index}`}
          value={option.label}
          className="mt-6"
        >
          {option.children}
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
};
