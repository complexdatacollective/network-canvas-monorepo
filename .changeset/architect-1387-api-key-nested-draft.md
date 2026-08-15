---
'@codaco/architect': patch
---

A half-typed API key is now treated as unsaved work, like every other editor's.

The API Key Browser on a Geospatial stage is an editor: you open it, type a name and a key, and it saves them into your protocol. Until now it was the only editor that never said so. Anything that took it off the screen — pressing Back, refreshing the page, or another tab of Architect handing this protocol back — threw away whatever you had typed, without asking and without a trace, even though the same actions stop and ask for every other editor in the app.

It now declares what it is holding. Back and refresh ask before discarding it. A protocol being handed back from another tab waits, and explains what it is waiting for, instead of closing the browser out from under you. And the browser's own Cancel, close button, Escape and click-outside all ask first, with the same wording you meet everywhere else — with Cancel focused, so nothing is discarded by a stray keypress.

The question is only asked about work that is still there: type something and undo it back to how you found it, and the browser closes without a word.

One message changed with it. When another tab has closed and this tab is waiting to take the protocol back, creating a key is still refused — nothing can be saved here until that has happened — but the refusal now names this form as what the wait is for, and tells you to cancel it, rather than pointing you at a question about your stage that may not be being asked.
