'use client';

import {
  cloneElement,
  type HTMLAttributes,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';

import { PortalContainerProvider } from './PortalContainer';
import { cx } from './utils/cva';

type ThemedRegionProps = {
  theme: 'interview';
  children: ReactNode;
  className?: string;
  render?: ReactElement;
} & Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className'>;

export function ThemedRegion({
  theme,
  render,
  children,
  className,
  ...rest
}: ThemedRegionProps) {
  const themeAttr = theme === 'interview' ? { 'data-theme-interview': '' } : {};
  // `theme-base` re-declares font-family / color / --scoped-bg /
  // --published-bg / --published-text at the themed region so descendants
  // pick up themed values via inheritance instead of the body-resolved
  // defaults. Interview is dark-only, so add Tailwind's `scheme-dark`
  // (color-scheme: dark) for native UI like form controls and scrollbars.
  const themeClasses = cx('theme-base', theme === 'interview' && 'scheme-dark');
  const body = <PortalContainerProvider>{children}</PortalContainerProvider>;

  if (render && isValidElement<HTMLAttributes<HTMLElement>>(render)) {
    return cloneElement(
      render,
      {
        ...themeAttr,
        ...rest,
        className: cx(themeClasses, render.props.className, className),
      },
      body,
    );
  }

  return (
    <div {...themeAttr} {...rest} className={cx(themeClasses, className)}>
      {body}
    </div>
  );
}
