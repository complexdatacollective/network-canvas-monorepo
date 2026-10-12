---
'@codaco/studio-web': patch
---

Fixed a Sociogram, Narrative or Network Composer stage that could not be saved after choosing its node type when the background was set to Image. Choosing the node type resets the background to concentric circles, and the background type now shows that, so an image chosen afterwards no longer leaves a hidden circle count behind that blocked saving.
