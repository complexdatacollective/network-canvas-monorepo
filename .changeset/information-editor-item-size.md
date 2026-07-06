---
'@codaco/architect-web': patch
---

Fix the Information stage editor producing invalid protocols. Text blocks could previously be resized, which set a display size that is no longer valid for text. Content blocks are now managed as a reorderable list with no limit on how many you can add, and a display size (Small, Medium, Large, or full size) can be set on image and video blocks only.
