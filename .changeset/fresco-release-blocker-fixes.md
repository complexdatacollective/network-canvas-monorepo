---
'fresco': patch
---

Fresco now handles recruitment links, activity reporting, hosted interview dialogs, and operational errors more reliably.

- Recruitment links for missing protocols show an actionable invalid-link page instead of a generic application error.
- Activity feed writes complete before a request finishes, and the corresponding analytics reports are flushed reliably. Uninstalling a protocol is now recorded as activity.
- Analytics receives activity types and counts without researcher or participant descriptions, and server events are correlated with the originating browser session.
- Interview confirmations restore focus to the control that opened them, while import and synchronization failures use concise messages without internal stack traces.
