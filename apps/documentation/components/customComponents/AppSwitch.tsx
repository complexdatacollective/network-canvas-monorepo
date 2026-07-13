'use client';

import { Globe, Monitor } from 'lucide-react';
import { Children, isValidElement, type ReactNode } from 'react';

import SegmentedSwitcher from '@codaco/fresco-ui/SegmentedSwitcher';
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
    <div className="py-8">
      <SegmentedSwitcher
        aria-label="Select application"
        value={activeLabel}
        onValueChange={selectApp}
        options={options.map((option) => ({
          value: option.label,
          label: option.label,
          icon: option.icon ? ICONS[option.icon] : undefined,
        }))}
      />
      <div className="mt-6">
        {options.map((option) => (
          <div key={option.label} hidden={option.label !== activeLabel}>
            {option.children}
          </div>
        ))}
      </div>
    </div>
  );
};
