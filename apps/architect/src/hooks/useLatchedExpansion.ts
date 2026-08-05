import { useEffect, useState } from 'react';

const useLatchedExpansion = (hasContent: boolean): boolean => {
  const [latched, setLatched] = useState(hasContent);

  useEffect(() => {
    if (hasContent) {
      setLatched(true);
    }
  }, [hasContent]);

  return latched;
};

export default useLatchedExpansion;
