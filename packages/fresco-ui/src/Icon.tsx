import { icons, type LucideProps } from 'lucide-react';

import customIcons from './icons/customIcons';

type CustomIconName = keyof typeof customIcons;
type LucideIconName = keyof typeof icons;

export type InterviewerIconName = CustomIconName | LucideIconName;

type IconProps = {
  name: InterviewerIconName;
} & LucideProps;

function isCustomIcon(name: string): name is CustomIconName {
  return Object.hasOwn(customIcons, name);
}

function isLucideIcon(name: string): name is LucideIconName {
  return Object.hasOwn(icons, name);
}

/** Whether Fresco can render this exact Network Canvas or Lucide icon name. */
export function isInterviewerIconName(
  name: string,
): name is InterviewerIconName {
  return isCustomIcon(name) || isLucideIcon(name);
}

export default function Icon({ name, ...props }: IconProps) {
  // Check custom icons first
  if (isCustomIcon(name)) {
    const CustomIcon = customIcons[name];
    return <CustomIcon className="size-32" name={name} {...props} />;
  }

  // Fall back to Lucide icons
  if (isLucideIcon(name)) {
    const LucideIcon = icons[name];

    return <LucideIcon {...props} />;
  }

  // Invalid icon name - return null silently
  return null;
}
