---
'@codaco/fresco-ui': major
---

`@codaco/fresco-ui` no longer exports `addDays` from `./form/utils/ymd`. `RelativeDatePickerField` derived its window through it directly; that stopped when it moved to `dateWithinPickerRange` (`@codaco/shared-consts`), which was `addDays`' last caller inside this repo. `todayYmd` is unaffected and still exported from the same subpath.

If you imported `addDays` directly, replace it with your own `YYYY-MM-DD` arithmetic, or with `dateWithinPickerRange`, `DATE_PICKER_EARLIEST_DATE`, and `DATE_PICKER_LATEST_DATE` from `@codaco/shared-consts` if what you needed was a date held inside the range a date field can represent.
