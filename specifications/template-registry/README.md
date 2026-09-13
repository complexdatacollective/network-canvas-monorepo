# Network Canvas template registry specification

The files in this directory are dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/), identified by
`SPDX-License-Identifier: CC0-1.0`. That dedication covers these specification
documents and conformance fixtures. It does not change the license of the
implementation elsewhere in this repository or of templates exchanged through
the registry.

The sole normative version 1 specification is the
[portable template exchange](../../apps/template-registry/spec/template-exchange-v1.md)
in the Registry service's `spec/` directory, alongside its generated OpenAPI
contracts. This directory retains a redirect from the former format document
and an [independent hash fixture](v1/hash-vector.json). Publication to the
separate public specification repository remains a release requirement.

The registry is an independent service. A registry account identifies a
publisher, and an entry identifies a location in that registry. The artifact's
Merkle root identifies the same immutable template version across registries
and Studio instances. Studio API credentials do not authenticate to a registry.
