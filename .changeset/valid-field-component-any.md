---
'@codaco/fresco-ui': patch
---

Restore `ValidFieldComponent = React.ComponentType<any>`. The narrower `React.ComponentType<FieldValueProps<FieldValue> & InjectedFieldProps>` introduced in 0.2.0 broke consumers that pass narrowly-typed field components (e.g. `InputField` accepts `value: string|number`) — contravariance forced them to handle the entire `FieldValue` union. The `any` is intentional and documented at the type definition.
