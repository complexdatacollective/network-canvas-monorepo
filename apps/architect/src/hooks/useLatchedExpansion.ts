import { useCallback, useEffect, useState } from 'react';

type LatchedExpansion = {
  startExpanded: boolean;
  /**
   * Call when the user closes the section themselves. Nothing else can tell an
   * explicit close from content that merely went away, and the two must not
   * behave alike.
   */
  onExplicitClose: () => void;
};

/**
 * Keeps a section expanded once it has content, so removing the last item does
 * not collapse the section out from under the user. An explicit close releases
 * the latch, so content restored afterwards — by undo, or by a reinitialize —
 * expands the section again rather than being saved out of sight.
 */
const useLatchedExpansion = (hasContent: boolean): LatchedExpansion => {
  const [latched, setLatched] = useState(hasContent);

  useEffect(() => {
    if (hasContent) {
      setLatched(true);
    }
  }, [hasContent]);

  const onExplicitClose = useCallback(() => setLatched(false), []);

  return { startExpanded: latched, onExplicitClose };
};

export default useLatchedExpansion;
