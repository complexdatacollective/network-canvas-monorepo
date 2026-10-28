import { useEffect, useState } from 'react';

// Milliseconds since `startedAt`, updated every second while `running`.
export const useElapsed = (startedAt: number, running: boolean): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  return Math.max(0, now - startedAt);
};
