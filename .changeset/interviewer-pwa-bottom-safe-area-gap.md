---
'@codaco/interviewer': patch
---

Fix a strip of empty space along the bottom of the screen when Interviewer is installed to the home screen (as a PWA) on iPad. In standalone display mode the app was sizing to an area that stopped short of the screen by the height of the bottom safe area, leaving the backdrop showing through below the interface. The app now fills the full visible viewport, so content reaches the bottom edge on every screen.
