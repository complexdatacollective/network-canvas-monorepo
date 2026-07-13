import { type useRender as UseRender, useRender } from '@base-ui/react';
import * as React from 'react';

import {
  NATIVE_LINK_LABEL_CLASS_NAME,
  NATIVE_LINK_ROOT_CLASS_NAME,
} from './styles/nativeLinkStyles';
import { cx } from './utils/cva';

export type NativeLinkProps = React.ComponentPropsWithoutRef<'a'> & {
  /** Render with a framework router link while retaining link semantics. */
  render?: UseRender.RenderProp;
};

export const NativeLink = React.forwardRef<HTMLAnchorElement, NativeLinkProps>(
  ({ className, children, render, ...props }, ref) =>
    useRender({
      defaultTagName: 'a',
      render,
      ref,
      props: {
        ...props,
        className: cx(NATIVE_LINK_ROOT_CLASS_NAME, className),
        children: (
          <span className={NATIVE_LINK_LABEL_CLASS_NAME}>{children}</span>
        ),
      },
    }),
);

NativeLink.displayName = 'NativeLink';
