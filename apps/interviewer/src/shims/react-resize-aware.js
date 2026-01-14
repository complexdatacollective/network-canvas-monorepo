/**
 * Shim for react-resize-aware that provides the jsx function
 * which is missing from the package's dist build.
 */
import { jsx } from 'react/jsx-runtime';
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';

// Styles for the resize listener iframe
const listenerStyle = {
  display: 'block',
  opacity: 0,
  position: 'absolute',
  top: 0,
  left: 0,
  height: '100%',
  width: '100%',
  overflow: 'hidden',
  pointerEvents: 'none',
  zIndex: -1,
  maxHeight: 'inherit',
  maxWidth: 'inherit',
};

// ResizeListener component
const ResizeListener = ({ onResize }) => {
  const ref = useRef();

  const getWindow = () => {
    return ref.current && ref.current.contentDocument && ref.current.contentDocument.defaultView;
  };

  const handleResize = () => {
    onResize(ref);
  };

  const handleLoad = () => {
    handleResize();
    const win = getWindow();
    if (win) {
      win.addEventListener('resize', handleResize);
    }
  };

  useEffect(() => {
    if (getWindow()) {
      handleLoad();
    } else if (ref.current && ref.current.addEventListener) {
      ref.current.addEventListener('load', handleLoad);
    }

    return () => {
      const win = getWindow();
      if (win && typeof win.removeEventListener === 'function') {
        win.removeEventListener('resize', handleResize);
      }
    };
  }, []);

  return jsx('iframe', {
    style: listenerStyle,
    src: 'about:blank',
    ref: ref,
    'aria-hidden': true,
    tabIndex: -1,
    frameBorder: 0,
  });
};

// Default size reporter
const defaultReporter = (el) => ({
  width: el != null ? el.offsetWidth : null,
  height: el != null ? el.offsetHeight : null,
});

// Main hook
const useResizeAware = (reporter = defaultReporter) => {
  const [sizes, setSizes] = useState(reporter(null));

  const onResize = useCallback(
    (ref) => {
      setSizes(reporter(ref.current));
    },
    [reporter]
  );

  const resizeListener = useMemo(() => jsx(ResizeListener, { onResize }), [onResize]);

  return [resizeListener, sizes];
};

export default useResizeAware;
