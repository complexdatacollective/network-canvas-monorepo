---
'@codaco/fresco-ui': patch
---

`AnimationProvider` with `disableAnimations`, or with `disableAnimationsForAutomation` in a detected automated browser, now also skips Motion's layout and `layoutId` animations. Before, a dialog that morphs out of the element that opened it, through a shared `layoutId`, still crossfaded in under Playwright, Storybook tests and Chromatic, so screenshots and accessibility checks could catch it part-way through. Disabling animations now sets Motion's page-wide `skipAnimations` flag, and the flag stays set for the life of the page.
