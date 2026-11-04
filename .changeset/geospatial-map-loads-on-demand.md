---
'@codaco/interview': patch
'@codaco/architect': patch
'@codaco/interviewer': patch
'fresco': patch
---

Interviews start faster: the map library used by geospatial stages now downloads only when a geospatial stage opens, instead of with every interview. In Fresco, this removes about 350 KB of compressed JavaScript from the interview page. The map looks and works as before, and if the library cannot be downloaded the stage shows its "map unavailable" message.
