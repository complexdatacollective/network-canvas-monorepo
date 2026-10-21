import { type ReactNode, useEffect, useRef } from 'react';

type Props = {
  children: ReactNode;
  className: string;
  // Move focus here when the screen appears, so keyboard and screen-reader
  // users start at the top of the new screen.
  focusOnMount?: boolean;
};

export const ScreenHeading = ({
  children,
  className,
  focusOnMount = false,
}: Props) => {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (focusOnMount) ref.current?.focus();
  }, [focusOnMount]);

  return (
    <h1
      ref={ref}
      tabIndex={-1}
      className={`m-0 focus:outline-none ${className}`}
    >
      {children}
    </h1>
  );
};
