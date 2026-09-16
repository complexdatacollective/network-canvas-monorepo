---
'networkcanvas.com': minor
---

Add a searchable, filterable protocol gallery with localized static study pages and repository-hosted protocol and codebook downloads, served from protocolgallery.networkcanvas.com.

Each protocol's stage sequence is read from its `.netcanvas` file at build time: gallery cards show a colour-coded stage bar with stage and edge-generation counts, and study pages list every stage with its interface type. The gallery can be filtered by field of study and edge-generation method, sorted, and searched.

Every protocol can be previewed in the browser without deploying it anywhere: the study page's "Preview in browser" action opens a popup that downloads the `.netcanvas`, migrates it to the current schema in memory, and runs it in the interview engine. Nothing entered in a preview is saved.
