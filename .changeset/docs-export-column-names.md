---
'@codaco/documentation': patch
---

The Data Export page now shows the CSV columns the export really writes. Its examples used `ego_id`, `alter_id`, `edge_id` and an `edge_type` column that don't exist; alter files start with `nodeID`, `networkCanvasEgoUUID` and `networkCanvasUUID`, edge files start with `edgeID`, `from` and `to`, and the edge type is in the file name. The page and the Export Data Dictionary now agree that `nodeID` is numbered from 1 in each interview across all node types, so `from` and `to` match it within one interview and `networkCanvasUUID` tells alters apart across interviews. The note about empty edge files now says exactly when one is written.
