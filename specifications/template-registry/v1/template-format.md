# Portable template container, version 1

SPDX-License-Identifier: CC0-1.0

This document defines the bytes exchanged when a Studio instance publishes or
imports an immutable template version. The requirements apply equally to
managed and self-hosted instances. The terms MUST, MUST NOT and MAY express
conformance requirements. The implementation supports protocol schema 8 in
format version 1; unsupported protocol schemas require an explicit compatible
reader, rather than an implicit import or migration.

## Container and files

A template is a ZIP container with media type
`application/vnd.networkcanvas.template+zip`. The suggested filename extension
is `.nctemplate`. ZIP storage and DEFLATE compression methods are supported.
Compression, entry timestamps and ZIP byte order do not define version identity.
Readers MUST validate the central directory and the local file stream, reject
duplicate file names, require the names and compression methods to agree, and
enforce the actual inflated sizes and CRC-32 checksums. Every central record
must point to its exact local file header and payload range; those ranges must
cover the complete local file region without gaps or overlap. General-purpose
flags and declared sizes must agree, including any data descriptor. A data
descriptor MUST include its `0x08074b50` signature. Version 1
uses ZIP 2.0 features and refuses encrypted, ZIP64 and multi-disk archives, ZIP
comments and extra fields, including Unicode-path overrides. The reference
writer emits deterministic, stored ZIP entries in filename order with the DOS
epoch timestamp.

The only permitted paths are:

| Path                     | Contents                                                       |
| ------------------------ | -------------------------------------------------------------- |
| `manifest.json`          | Manifest below, encoded as canonical JSON                      |
| `metadata.json`          | Author-editable metadata, encoded as canonical JSON            |
| `license.json`           | `{"spdx":"CC0-1.0"}` or `{"spdx":"CC-BY-4.0"}`, canonical JSON |
| `sections/<sha256>.json` | Canonical JSON for a referenced Studio section                 |
| `assets/<sha256>`        | Raw bytes for a referenced asset                               |

Hashes are 64 lowercase hexadecimal characters. Directories, path traversal,
absolute paths and other files are forbidden. Multiple references MAY share a
single content-addressed file; multiple entries with the same filename are
forbidden. Every referenced file MUST exist, and every section/asset file MUST
be referenced by the manifest. Nothing is extracted to a filesystem or executed.

Readers MUST apply these limits before and during decompression:

| Limit                                       | Maximum |
| ------------------------------------------- | ------: |
| Compressed container                        |  25 MiB |
| Total actual uncompressed bytes             |  32 MiB |
| Each raw asset                              |  10 MiB |
| Each section document                       |   1 MiB |
| Each manifest, metadata or license document | 128 KiB |
| Section references                          |     512 |
| Asset references                            |     128 |
| ZIP entries                                 |    1024 |
| JSON nesting depth, root at depth 0         |      64 |

MiB means 1,048,576 bytes. An entry's actual uncompressed size MUST equal its
declared size. An invalid or oversized container MUST fail before any imported
instance data is written. Transport limits do not replace registry account
quotas, request limits or resource concurrency limits.

## Canonical JSON and identity

JSON files use UTF-8 without a byte order mark. JSON values are serialized
without whitespace. Object keys are sorted recursively using lexicographic
UTF-16 code-unit order; array order is preserved. Strings and finite numbers
use ECMAScript `JSON.stringify` representation. For example,
`{"z":2,"a":{"y":1,"x":0}}` becomes `{"a":{"x":0,"y":1},"z":2}`.
Readers MUST reject a JSON file whose exact bytes differ from this canonical
serialization. Duplicate keys, non-canonical number spellings, invalid UTF-8,
unpaired Unicode surrogates and U+0000 in keys or values are forbidden.

Every section, metadata document and license document is hashed with SHA-256
over its canonical UTF-8 bytes. Every asset is hashed with SHA-256 over its raw
bytes. A version is identified by the SHA-256 of the canonical manifest after
removing only its `merkle_root` property. This one-level Merkle tree commits to
the typed, ordered content references, metadata, license, format and schema
versions, and template header. Readers MUST verify every leaf and the root.
The hash of the ZIP bytes is a transport/storage checksum and is a different
value from the global version identity.

Registry URLs, entry IDs, publisher account IDs, fetch timestamps, moderation
state and instance provenance MUST NOT appear in this manifest. Moving the
artifact between registries MUST preserve the root. Changing an authored field,
license, section, asset or template version produces a different root.

The [hash fixture](hash-vector.json) includes an input, the exact canonical
root input and its expected manifest. Its hashes were generated independently
with Python's standard SHA-256 implementation; the implementation tests compare
the shared encoder against these values. The fixture uses ASCII and integer
values so its serialization is unambiguous across languages.

## Manifest

The manifest is a strict object with these fields; unknown fields are forbidden:

| Field                     | Type and requirements                                           |
| ------------------------- | --------------------------------------------------------------- |
| `format`                  | Literal `network-canvas-template`                               |
| `format_version`          | Integer `1`                                                     |
| `protocol_schema_version` | Protocol schema version; this reader admits `8`                 |
| `template`                | Header below                                                    |
| `sections`                | Nonempty array of `{id, hash}`, strictly ascending by `id`      |
| `assets`                  | Array of asset references below, strictly ascending by `source` |
| `metadata_hash`           | SHA-256 of `metadata.json`                                      |
| `license_hash`            | SHA-256 of `license.json`                                       |
| `merkle_root`             | Global version identity computed above                          |

The strict template header contains `name` (nonblank, 1–200 UTF-16 code units),
`kind` (`protocol`, `stage`, `entity_definition`, `variable_set` or
`generator_prompt_set`), and `version` (integer 1–2,147,483,647). An optional
`summary` is 1–2000 code units. A new registry publication references an already
frozen instance version; editing its authored content requires a new version.

Section IDs use the existing Studio taxonomy: `settings`, `stageOrder`,
`stage:<id>`, `codebook:node:<id>`, `codebook:edge:<id>`, `codebook:ego`, and
`assets`. IDs are 1–255 code units. Each section MUST pass the same current
protocol schema checks as a Studio draft. A stage document's own ID MUST agree
with its section ID. A supplied stage-order document MUST list every included
stage exactly once. Manifest sorting does not change interview stage order:
execution order is authored in `stageOrder`.

For kind `protocol`, the assembled document MUST also pass the complete current
protocol schema validation. Partial kinds undergo per-section validation and
asset reference validation; resolving their destination entities and variables
when inserting them is the separate Studio insertion contract. A container
MUST contain every referenced asset, including references in partial templates.

Each strict asset reference contains:

| Field         | Requirements                                                                         |
| ------------- | ------------------------------------------------------------------------------------ |
| `source`      | Nonblank filename, 1–255 code units; no `/`, `\`, C0 control characters, `.` or `..` |
| `hash`        | SHA-256 of the raw bytes                                                             |
| `byte_size`   | Integer 1–10 MiB, equal to the actual byte length                                    |
| `media_class` | `image`, `audio`, `video` or `dataset`                                               |
| `media_type`  | An admitted media type below                                                         |

The protocol `assets` section keeps its authored asset IDs and filenames.
Each definition MUST match a supplied `source` and media class; `network` and
`geojson` definitions correspond to `dataset`. Each supplied source MUST have
an asset definition. Embedded `apikey` definitions are forbidden.

## Metadata and license

Metadata is a strict, versioned author document. `schema_version: 1` is required.
All remaining fields are optional for open publication. Validation MUST NOT
translate, trim, rewrite, silently drop, or add authored fields. Optional text
fields, when supplied, must contain at least one non-whitespace character.
String lengths below use UTF-16 code units. Text cannot contain U+0000 or
unpaired surrogates.

| Field           | Requirements                                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `authors`       | At most 100 strict objects with required `name` (200), optional `affiliation` (500), optional `orcid`                                |
| `keywords`      | At most 100 nonblank strings, each at most 100                                                                                       |
| `description`   | Nonblank text, at most 20,000                                                                                                        |
| `publications`  | At most 100 strict objects: required `citation` (4000), required `relation` (`describes`, `validates`, `uses`), optional `doi` (255) |
| `related_links` | At most 100 strict objects: required absolute HTTPS `url` (2048), optional nonblank `label` (200)                                    |
| `funding`       | Nonblank text, at most 4000                                                                                                          |

ORCID has format `dddd-dddd-dddd-dddC`, where `d` is a decimal digit and `C` is a
digit or uppercase `X`. This is an author-supplied, format-validated identifier;
it is not proof of ORCID ownership. DOI has the bare form `10.<4–9 digits>/<suffix>`
with a nonempty suffix containing no whitespace. A DOI records the publication;
neither publication nor import registers a DOI or verifies its academic claims.

Open publication requires a name, kind and one of the admitted licenses. A
curated designation additionally requires at least one author, a description
and at least one keyword. Meeting this metadata bar does not itself grant the
curated designation. Publisher email and registry moderation information belong
to registry records, not this author document.

On import, Studio preserves this document and writes machine provenance in a
separate origin field containing `registry_url`, `entry_id`,
`source_version_hash`, and `fetched_at`. Authored metadata writes cannot mutate
that origin. The original license and metadata remain part of the immutable
imported version; later authorship changes create a new version.

## Asset intake

The binary allowlist is:

- Images: `image/png`, `image/apng`, `image/jpeg`, `image/gif`, `image/webp`,
  `image/avif`.
- Audio: `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/aac`, `audio/flac`,
  `audio/mp4`.
- Video: `video/mp4`, `video/webm`, `video/ogg`.

Binary type detection MUST agree with the declared type and class. This is
mechanical screening, not a claim that a file has undergone comprehensive
malware analysis. SVG, HTML, executable code, documents outside this allowlist,
and unknown binary types are refused.

Datasets admit `text/csv`, `application/json` and `application/geo+json`. They
MUST be nonempty valid UTF-8 without disallowed control bytes. JSON datasets
must parse as an object or array; GeoJSON must name a GeoJSON root type. CSV
must not start with an HTML, SVG, script or doctype document. Dataset contents
are data and MUST NOT be evaluated or served as active browser documents.
All downloaded artifacts and raw asset responses require safe content-type and
content-disposition handling; a publisher-supplied filename is not a response
header or a storage path.

## Refusals

The reference boundary exposes these stable codes, without echoing submitted
content or parser exception text. The HTTP service maps them to its versioned
RFC 9457 problem types.

| Code                          | Meaning                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `TEMPLATE_ARTIFACT_INVALID`   | Invalid container, manifest, canonical JSON, ordering, or missing/extra files |
| `TEMPLATE_FORMAT_UNSUPPORTED` | Unknown format or format revision                                             |
| `TEMPLATE_SCHEMA_UNSUPPORTED` | Unsupported protocol schema; includes the requested schema version            |
| `TEMPLATE_CONTENT_MISMATCH`   | A leaf checksum or Merkle root disagrees                                      |
| `TEMPLATE_SECTIONS_INVALID`   | Protocol section/document validation failed                                   |
| `TEMPLATE_ASSET_DISALLOWED`   | Unsafe/unknown asset type, embedded secret asset, or missing referenced asset |
| `TEMPLATE_TOO_LARGE`          | A size or count limit was exceeded                                            |
