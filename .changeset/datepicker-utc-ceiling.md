---
'@codaco/fresco-ui': patch
---

The date picker's year and month dropdowns now decide what "today" is the same way the rest of Network Canvas does.

When a date question sets no latest date, the picker stops offering dates after today. It worked out today from the device's own clock and timezone, while every other part of the software — including the relative date picker beside it, and the dates generated when you preview a protocol — works it out in UTC. For part of each day the two disagreed, so a participant west of UTC could be offered a month that had not started elsewhere, and one east of UTC could be shown a month the rest of the software still considered next month. Both now agree.
