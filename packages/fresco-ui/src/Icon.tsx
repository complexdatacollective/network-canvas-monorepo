import type { LucideProps } from 'lucide-react';

import customIcons from './icons/customIcons';
import LucideIcon from './icons/LucideIcon';
import { isLucideIconName, type LucideIconName } from './icons/lucideIconNames';

type CustomIconName = keyof typeof customIcons;

export type InterviewerIconName = CustomIconName | LucideIconName;

type IconProps = {
  name: InterviewerIconName;
} & LucideProps;

function isCustomIcon(name: string): name is CustomIconName {
  return Object.hasOwn(customIcons, name);
}

/** Whether Fresco can render this exact Network Canvas or Lucide icon name. */
export function isInterviewerIconName(
  name: string,
): name is InterviewerIconName {
  return isCustomIcon(name) || isLucideIconName(name);
}

export default function Icon({ name, ...props }: IconProps) {
  // Check custom icons first
  if (isCustomIcon(name)) {
    const CustomIcon = customIcons[name];
    return <CustomIcon className="size-32" name={name} {...props} />;
  }

  // Fall back to Lucide icons
  if (isLucideIconName(name)) {
    return <LucideIcon name={name} {...props} />;
  }

  // Invalid icon name - return null silently
  return null;
}
