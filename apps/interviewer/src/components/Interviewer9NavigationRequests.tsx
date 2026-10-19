import { useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'wouter';

import { isInterviewRoutePath } from '~/lib/auth/interviewRecoveryRestriction';
import {
  getInterviewer9Navigation,
  subscribeInterviewer9Navigation,
  takeInterviewer9Navigation,
} from '~/lib/handoff/interviewer9Handoff';
import { leaveForInterviewer9 } from '~/lib/handoff/interviewer9Navigation';

// Carries out a navigation to Interviewer 9 that was requested outside React
// (an OS file launch reaching an Interviewer 8 window). An interview is only
// ever left through its own exit step, so while one is on screen — even
// behind the lock screen — the request waits until the interview has been
// left.
export function Interviewer9NavigationRequests() {
  const [location] = useLocation();
  const pending = useSyncExternalStore(
    subscribeInterviewer9Navigation,
    getInterviewer9Navigation,
  );

  // Leaving is a full-page navigation, a side effect on the browser outside
  // React, so it belongs in an effect.
  useEffect(() => {
    if (pending === null || isInterviewRoutePath(location)) return;
    const url = takeInterviewer9Navigation();
    if (url !== null) leaveForInterviewer9(url);
  }, [location, pending]);

  return null;
}
