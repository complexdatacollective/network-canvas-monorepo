# Network Canvas template registry specification

The files in this directory are dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), identified by
`SPDX-License-Identifier: CC0-1.0`. That dedication covers these specification
documents and conformance fixtures. It does not change the license of the
implementation elsewhere in this repository or of templates exchanged through
the registry.

Version 1 defines the [portable template container](v1/template-format.md) and
an [independent hash fixture](v1/hash-vector.json). The HTTP API specification
will be generated from the registry's executable endpoint contracts in the
service slice. These are reviewable publication sources; publication to the
separate public specification repository remains a release requirement.

The registry is an independent service. A registry account identifies a
publisher, and an entry identifies a location in that registry. The artifact's
Merkle root identifies the same immutable template version across registries
and Studio instances. Studio API credentials do not authenticate to a registry.
