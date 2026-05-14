# @codaco/architect-web

## 7.6.0

### Minor Changes

- 7775d5f: Replace FamilyTreeCensus stage editor with FamilyPedigree, matching restructured protocol schema. The new editor organizes configuration into Node Configuration and Edge Configuration sections, simplifies the census prompt, and generalizes disease nomination prompts into generic nomination prompts.

### Patch Changes

- Updated dependencies [f1dbd8d]
  - @codaco/protocol-validation@11.4.0

## 7.5.2

### Patch Changes

- Updated dependencies [b8b9fb0]
  - @codaco/protocol-validation@11.2.0

## 7.5.1

### Patch Changes

- Updated dependencies [4f2d778]
  - @codaco/protocol-validation@11.1.1

## 7.5.0

### Minor Changes

- 273bcbe: Add optional showTransit and allowSearch configuration options to geospatial interface mapOptions:

  - showTransit: When enabled, Fresco displays transit layers on the map
  - allowSearch: When enabled, participants can search the map for locations

  Both options default to false (disabled).

- Updated dependencies [273bcbe]
  - @codaco/protocol-validation@11.1.0

## 7.4.0

### Minor Changes

- 8f91391: Remove `introductionPanel` from Geospatial interface schema.

  This is a breaking change for existing protocols that include an `introductionPanel` on Geospatial stages. Protocols with Geospatial interfaces no longer support or require an introduction panel.

### Patch Changes

- Updated dependencies [8f91391]
  - @codaco/protocol-validation@11.0.0

## 7.3.0

### Minor Changes

- b713317: Add greaterThanOrEqualToVariable and lessThanOrEqualToVariable validations for number, datetime, and scalar variable types

### Patch Changes

- Updated dependencies [b713317]
  - @codaco/protocol-validation@10.1.0

## 7.2.0

### Minor Changes

- 23b675c: Migrate from direct PostHog usage to @codaco/analytics package for consistent analytics across all Network Canvas apps

## 7.1.0

### Minor Changes

- 01448c8: Split Family Tree sexVariable into egoSexVariable and nodeSexVariable.

  This is a breaking change for existing protocols that reference the old sexVariable field. Protocols with Farmily Tree interfaces require that the egoSexVariable and nodeSexVariable be defined separately.

### Patch Changes

- Updated dependencies [01448c8]
  - @codaco/protocol-validation@10.0.0

## 7.0.3

### Patch Changes

- Updated dependencies [cc2adc3]
  - @codaco/protocol-validation@9.0.0

## 7.0.2

### Patch Changes

- Updated dependencies [9958b67]
  - @codaco/protocol-validation@8.0.2

## 7.0.1

### Patch Changes

- Updated dependencies [84d09e3]
  - @codaco/protocol-validation@8.0.1
