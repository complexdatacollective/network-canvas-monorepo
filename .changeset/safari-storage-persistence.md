---
'@codaco/interviewer': patch
---

Improved the storage-durability indicator for Safari. The app now re-requests persistent storage on your first interaction — Safari grants the request silently based on interaction history, so asking only at startup was routinely denied — and the indicator updates immediately when a grant lands. When running as an installed app, an ungranted request now shows as a calm "Storage best effort" note instead of a warning: installed-app data is kept separate from browsing data and is not subject to the browser's routine cleanup, and there is no further install action to take.
