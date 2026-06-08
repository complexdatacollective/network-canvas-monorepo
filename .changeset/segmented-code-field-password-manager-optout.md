---
'@codaco/fresco-ui': patch
---

`SegmentedCodeField`: when `sensitive`, add password-manager opt-out attributes (`data-1p-ignore`, `data-bwignore`, `data-protonpass-ignore`, `data-lpignore`, `data-form-type="other"`) to the segment inputs. A masked code such as a device PIN is rendered as `type="password"`, which otherwise prompts password managers to offer fill/save — inappropriate for a per-device numeric PIN.
