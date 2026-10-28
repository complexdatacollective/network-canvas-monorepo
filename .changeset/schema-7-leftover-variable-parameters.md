---
'@codaco/protocol-validation': patch
---

Older protocols that failed to open with an "Unrecognized key: parameters" error now upgrade. Upgrading removes `parameters` from any attribute other than a scalar or datetime attribute, and from a scalar attribute it keeps only the `minLabel` and `maxLabel` labels.
