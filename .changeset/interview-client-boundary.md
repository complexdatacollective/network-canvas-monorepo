---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Every module that runs a React hook now declares `'use client'`, so a Next App
Router application can import this runtime from a Server Component.

Seventy-four modules were missing the directive: the navigation, node list, node
drawer and panel components, the canvas layers and their layout hooks, the
protocol form, and the Anonymisation, CategoricalBin, DyadCensus, EgoForm,
FamilyPedigree, Geospatial, NameGenerator, NameGeneratorRoster, Narrative,
NarrativePedigree, NetworkComposer, OneToManyDyadCensus, OrdinalBin, SlidesForm
and Sociogram interfaces. An unmarked module is treated as server code, so
reaching one from a Server Component's import graph failed the build rather than
rendering.

The published bundles now carry the directive too. Bundling had been erasing it,
so even the modules that already declared it arrived at npm consumers unmarked.
`dist/index.js` and the lazily loaded Geospatial chunks are now marked;
`dist/contract.js` and `dist/protocol-schema-version.js` are unmarked, as their
server safety intends, and stay that way only for as long as no module carrying
the directive is reachable from them.

Architect, Interviewer and Fresco are released alongside because each bundles
this runtime. Nothing about how an interview looks or behaves changes.
