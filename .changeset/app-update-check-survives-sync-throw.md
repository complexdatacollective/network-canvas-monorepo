---
'@codaco/architect': patch
'@codaco/interviewer': patch
---

The hourly check for a new app version no longer reports a crash of its own.
Firefox refuses the check outright once the installed app worker has been
replaced, and that refusal was being shown as an application error. The check
now stays quiet and tries again on the next hour.
