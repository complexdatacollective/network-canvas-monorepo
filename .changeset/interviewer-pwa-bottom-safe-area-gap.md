---
'@codaco/interviewer': patch
---

Fix the band of empty background around the screen edges when Interviewer is installed to the home screen (as a PWA) on iPad. In standalone display mode the app was sizing to an area that stopped short of the screen (leaving the backdrop showing below the interface) and reserved the top safe area app-wide (leaving a band above the interview navigation). The app now fills the full visible viewport and renders edge-to-edge, so backgrounds reach every edge while on-screen controls stay clear of the status bar and home indicator.
