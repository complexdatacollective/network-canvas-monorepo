'use client';

import { Globe, Monitor } from 'lucide-react';
import { Children, isValidElement, type ReactNode } from 'react';

import { Tabs, TabsPanel } from '@codaco/fresco-ui/Tabs';
import {
  type AppAxis,
  useSelectedApp,
} from '~/components/customComponents/useSelectedApp';

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
    <Tabs
      aria-label="Select application"
      layout="top"
      value={activeLabel}
      onValueChange={selectApp}
      className="py-8"
      tabs={options.map((option) => ({
        value: option.label,
        label: option.label,
        icon: option.icon ? ICONS[option.icon] : undefined,
      }))}
    >
      {options.map((option) => (
        <TabsPanel key={option.label} value={option.label}>
          {option.children}
        </TabsPanel>
      ))}
    </Tabs>
  );
};
