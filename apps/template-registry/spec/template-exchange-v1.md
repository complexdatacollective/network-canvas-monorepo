# Network Canvas template exchange format, version 1

## Status and scope

This document specifies version 1 of the portable Network Canvas template
artifact. The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, and
**MAY** are to be interpreted as described in RFC 2119 and RFC 8174 when they
appear in uppercase.

The media type is
`application/vnd.networkcanvas.template+zip`. A conforming artifact is a
bounded ZIP container whose content is identified independently of any
registry. It contains declarative protocol sections, metadata, a license, and
optional inert assets. It contains no executable content.

The artifact format is distinct from the Template Registry API. A registry
entry UUID locates a publication. The `merkle_root` in the artifact manifest
identifies the immutable artifact content. Two registries can therefore serve
the same artifact under different entry UUIDs while preserving one content
identity.

## Terminology

- **Canonical JSON** is the exact UTF-8 serialization defined below.
- **Content hash** is the lowercase hexadecimal SHA-256 digest of the exact
  file bytes.
- **Section ID** is a Network Canvas protocol-store section identifier.
- **Source name** is the logical filename used by an asset definition inside a
  protocol section. It is not a ZIP path.
- **Supported protocol schema version** is a schema version that the consumer
  can validate and import. A consumer MUST reject an unsupported version.

## Container profile

The container MUST use the ZIP file format with only ZIP 2.0 features. Readers
MUST reject:

- encrypted, multi-disk, or ZIP64 archives;
- archive comments, per-entry comments, and extra fields;
- directory entries, non-ASCII entry names, duplicate entry names, and names
  outside the grammar below;
- inconsistent local headers, central-directory records, CRC-32 values,
  compressed sizes, uncompressed sizes, compression methods, or data
  descriptors;
- overlapping entries, bytes outside the declared entry ranges, or a central
  directory that does not end immediately before the end-of-central-directory
  record; and
- compression methods other than stored (`0`) and DEFLATE (`8`).

A reader MUST enforce both the sizes declared by ZIP and the bytes actually
produced during decompression. It MUST verify the complete archive before
using any content and SHOULD process entries without extracting them to a
filesystem. Readers MUST ignore ZIP external file attributes and materialize
payloads only as regular byte sequences. If writing entries to disk, they MUST
create new regular files without following symlinks; they MUST NOT restore
symlinks, devices, sockets, FIFOs, executable permission bits, or other special
file metadata from the archive.

Only these entry names are valid:

```text
manifest.json
metadata.json
license.json
sections/<64 lowercase hexadecimal characters>.json
assets/<64 lowercase hexadecimal characters>
```

`manifest.json`, `metadata.json`, and `license.json` are REQUIRED exactly once.
At least one section is REQUIRED. Every section and asset named by the
manifest MUST exist. Every file in the archive MUST be named by the manifest;
unreferenced or unknown files are invalid. Multiple logical references MAY
share one content-hash path when their exact bytes are identical.

Writers SHOULD sort ZIP entries by their ASCII path and use a fixed timestamp
to make transport bytes reproducible. ZIP entry order, compression level, and
timestamps do not participate in the artifact identity.

## Canonical JSON

All four JSON-bearing entry classes (`manifest.json`, `metadata.json`,
`license.json`, and section files) MUST contain canonical JSON. The canonical
serialization is defined recursively:

1. Serialize JSON primitives with the ECMAScript `JSON.stringify` rules,
   including its number and string escaping rules.
2. Preserve array order and serialize each element canonically, with no
   whitespace between tokens.
3. Sort object member names in ascending ECMAScript string comparison order,
   serialize each name with `JSON.stringify`, and serialize its value
   canonically. Insert no whitespace.
4. Encode the resulting string as UTF-8 without a byte-order mark or trailing
   newline.

Only JSON data is valid on the wire. A reader MUST reject invalid UTF-8,
duplicate object keys, non-canonical member order or whitespace, any value at
a nesting depth greater than 64 (the root has depth zero and each array element
or object member value adds one), NUL characters, and unpaired Unicode surrogates. Comparing
the decoded value reserialized by the algorithm above with the original text
is the final canonicality check.

Unless a byte limit is stated, every character limit in this specification is
measured in ECMAScript UTF-16 code units, the same measure used by the
authoritative validators' JavaScript `String.length`. A supplementary Unicode
scalar value therefore counts as two characters for these limits. UTF-8 byte
limits and hash inputs continue to use encoded bytes.

## Hashes and artifact identity

Every hash in this format is a 64-character lowercase hexadecimal SHA-256
digest.

- A section reference hashes the exact canonical bytes of its section file.
- An asset reference hashes the exact raw bytes of its asset file.
- `metadata_hash` hashes the exact canonical bytes of `metadata.json`.
- `license_hash` hashes the exact canonical bytes of `license.json`.
- `merkle_root` hashes the canonical JSON bytes of the complete manifest object
  with the `merkle_root` member omitted.

The last rule defines a one-level Merkle commitment: the root commits to the
template descriptor, ordered section and asset references, metadata hash, and
license hash. A verifier MUST recompute every leaf hash and the root. A
mismatch makes the artifact invalid.

## Manifest

`manifest.json` MUST be a JSON object with exactly these members:

| Member                    | Type             | Requirement                               |
| ------------------------- | ---------------- | ----------------------------------------- |
| `format`                  | string           | MUST equal `network-canvas-template`.     |
| `format_version`          | integer          | MUST equal `1`.                           |
| `protocol_schema_version` | positive integer | Schema used to validate the sections.     |
| `template`                | object           | Frozen template descriptor defined below. |
| `sections`                | array            | 1–512 ordered section references.         |
| `assets`                  | array            | 0–128 ordered asset references.           |
| `metadata_hash`           | content hash     | Hash of `metadata.json`.                  |
| `license_hash`            | content hash     | Hash of `license.json`.                   |
| `merkle_root`             | content hash     | Artifact identity computed above.         |

The `template` object MUST contain exactly:

| Member    | Type    | Requirement                                                                                 |
| --------- | ------- | ------------------------------------------------------------------------------------------- |
| `name`    | string  | 1–200 characters and not whitespace-only.                                                   |
| `kind`    | string  | One of `protocol`, `stage`, `entity_definition`, `variable_set`, or `generator_prompt_set`. |
| `version` | integer | 1–2,147,483,647.                                                                            |
| `summary` | string  | Optional; 1–2,000 characters.                                                               |

Each member of `sections` MUST contain exactly an `id` string of 1–255
characters and a `hash`. The array MUST be sorted with the comparator
`a < b ? -1 : a > b ? 1 : 0`, where the comparisons are ECMAScript string
comparisons over UTF-16 code units. It MUST NOT contain duplicate IDs. Its file
is `sections/<hash>.json`.

For example, the exact order of this non-BMP pair is:

```text
input:  ["stage:\u{10000}", "stage:\uE000"]
output: ["stage:\u{10000}", "stage:\uE000"]
```

U+10000 is numerically greater than U+E000 as a Unicode scalar value, but its
leading UTF-16 code unit (U+D800) sorts before U+E000. Implementations MUST
apply the specified UTF-16 comparison rather than a locale or code-point
collator.

Each member of `assets` MUST contain exactly:

| Member        | Type         | Requirement                                                                                             |
| ------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `source`      | string       | 1–255 characters; not `.`, `..`, or whitespace-only; no slash, backslash, NUL, or C0 control character. |
| `hash`        | content hash | Hash of the raw asset bytes.                                                                            |
| `byte_size`   | integer      | 1–10,485,760 bytes inclusive and equal to the actual byte length.                                       |
| `media_class` | string       | One of `image`, `audio`, `video`, or `dataset`.                                                         |
| `media_type`  | string       | 1–127 characters and admitted for the declared class.                                                   |

The `assets` array MUST use the same UTF-16 comparator on `source` and MUST NOT
contain duplicate sources. Its file is `assets/<hash>`.

All manifest objects are closed: a reader MUST reject additional members.

## Metadata document

`metadata.json` is the authored metadata document. It MUST be an object with
`schema_version` equal to the integer `1` and only the optional members below.
Importers MUST preserve the document and MUST NOT add machine provenance to it.

| Member           | Shape and limits                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `schema_version` | Integer; MUST equal `1`.                                                                                                           |
| `authors`        | Up to 100 objects with required `name` (1–200), optional `affiliation` (1–500), and optional `orcid`.                              |
| `keywords`       | Up to 100 strings, each 1–100 characters.                                                                                          |
| `description`    | String of 1–20,000 characters.                                                                                                     |
| `publications`   | Up to 100 objects with required `citation` (1–4,000), required `relation` (`describes`, `validates`, or `uses`), and optional DOI. |
| `related_links`  | Up to 100 objects with required HTTPS `url` (at most 2,048 characters) and optional `label` (1–200).                               |
| `funding`        | String of 1–4,000 characters.                                                                                                      |

Every bounded text string MUST contain a non-whitespace character, valid
Unicode, and no NUL. An ORCID, when present, MUST match
`dddd-dddd-dddd-dddC`, where each `d` is a decimal digit and `C` is a decimal
digit or `X`. This is syntax validation and does not assert that the author
controls that ORCID. A DOI, when present, MUST match `10.` followed by 4–9
digits, `/`, and one or more non-whitespace characters, with a maximum length
of 255.

Related-link URLs are parsed with the WHATWG URL parser. The source string
MUST begin, case-insensitively, with `https://` followed by a non-empty
authority before any `/`, `?`, or `#`; it MUST contain no reverse solidus
(`\\`). The parsed URL MUST have protocol `https:`, a non-empty hostname, and
empty username and password components. Paths, queries, fragments, ports, and
internationalized hostnames accepted by that parser remain permitted.

The metadata object and every nested object are closed. Registry curation can
require an author, description, and keyword, but those fields are not required
for a valid publication and curation does not change artifact identity.

An importing instance records machine-written origin data separately. That
origin contains the registry URL, registry entry UUID, source version hash, and
fetch timestamp; it is not part of `metadata.json` or the fetched artifact.

## License document

`license.json` MUST be a closed canonical JSON object with one member:

```json
{"spdx":"CC-BY-4.0"}
```

The `spdx` value MUST be either `CC-BY-4.0` or `CC0-1.0`. This license applies
to the template artifact. The CC0 dedication covering this specification does
not replace the artifact's declared license.

## Sections

### Protocol schema mapping

`format_version` 1 and `protocol_schema_version` are independent. This
revision emits `protocol_schema_version: 8`. The value is the exact
`CURRENT_SCHEMA_VERSION` supported by `@codaco/protocol-validation` 13.0.1;
an implementation MUST reject another value until it has the corresponding
validator. The authoritative source snapshot for this mapping is commit
[`08fa2a22b2fab5132d1bf6f2fd5c6a6285848701`](https://github.com/complexdatacollective/network-canvas-monorepo/tree/08fa2a22b2fab5132d1bf6f2fd5c6a6285848701).

The section wrappers and their authoritative schema entry points are:

| Section ID           | Schema for `protocol_schema_version: 8`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `settings`           | `SettingsSectionSchema` in [`packages/studio-sync/src/section-validation.ts`](https://github.com/complexdatacollective/network-canvas-monorepo/blob/08fa2a22b2fab5132d1bf6f2fd5c6a6285848701/packages/studio-sync/src/section-validation.ts)                                                                                                                                                                                                                                                                                                             |
| `stageOrder`         | `StageOrderSectionSchema` in [`packages/studio-sync/src/section-validation.ts`](https://github.com/complexdatacollective/network-canvas-monorepo/blob/08fa2a22b2fab5132d1bf6f2fd5c6a6285848701/packages/studio-sync/src/section-validation.ts)                                                                                                                                                                                                                                                                                                           |
| `stage:<id>`         | `stageSchema` in [`packages/protocol-validation/src/schemas/8/stages/index.ts`](https://github.com/complexdatacollective/network-canvas-monorepo/blob/08fa2a22b2fab5132d1bf6f2fd5c6a6285848701/packages/protocol-validation/src/schemas/8/stages/index.ts)                                                                                                                                                                                                                                                                                               |
| `codebook:node:<id>` | `NodeDefinitionSchema` in [`packages/protocol-validation/src/schemas/8/codebook/definitions.ts`](https://github.com/complexdatacollective/network-canvas-monorepo/blob/08fa2a22b2fab5132d1bf6f2fd5c6a6285848701/packages/protocol-validation/src/schemas/8/codebook/definitions.ts)                                                                                                                                                                                                                                                                      |
| `codebook:edge:<id>` | `EdgeDefinitionSchema` in [`packages/protocol-validation/src/schemas/8/codebook/definitions.ts`](https://github.com/complexdatacollective/network-canvas-monorepo/blob/08fa2a22b2fab5132d1bf6f2fd5c6a6285848701/packages/protocol-validation/src/schemas/8/codebook/definitions.ts)                                                                                                                                                                                                                                                                      |
| `codebook:ego`       | `EgoDefinitionSchema` in [`packages/protocol-validation/src/schemas/8/codebook/definitions.ts`](https://github.com/complexdatacollective/network-canvas-monorepo/blob/08fa2a22b2fab5132d1bf6f2fd5c6a6285848701/packages/protocol-validation/src/schemas/8/codebook/definitions.ts)                                                                                                                                                                                                                                                                       |
| `assets`             | `AssetsSectionSchema` in [`packages/studio-sync/src/section-validation.ts`](https://github.com/complexdatacollective/network-canvas-monorepo/blob/08fa2a22b2fab5132d1bf6f2fd5c6a6285848701/packages/studio-sync/src/section-validation.ts), an asset-ID-keyed `z.record` whose values use `assetSchema` from [`packages/protocol-validation/src/schemas/8/assets/assets.ts`](https://github.com/complexdatacollective/network-canvas-monorepo/blob/08fa2a22b2fab5132d1bf6f2fd5c6a6285848701/packages/protocol-validation/src/schemas/8/assets/assets.ts) |

For a complete protocol template, the assembled sections MUST additionally
validate against `ProtocolSchemaV8`, the default export of
[`packages/protocol-validation/src/schemas/8/schema.ts`](https://github.com/complexdatacollective/network-canvas-monorepo/blob/08fa2a22b2fab5132d1bf6f2fd5c6a6285848701/packages/protocol-validation/src/schemas/8/schema.ts). These immutable source references are normative version pins for independent implementations; this document does not copy the validator source. The validator packages retain their own software license. The files in this `spec/` directory, including these schema references, are dedicated under CC0 as stated in [`README.md`](README.md) and [`LICENSE`](LICENSE); that dedication does not relicense validator source or template artifacts.

Each section file MUST contain a canonical JSON object that validates as the
section named by its section ID under `protocol_schema_version`. For
`protocol_schema_version: 8`, the recognized section IDs are:

```text
settings
stageOrder
stage:<non-empty stage id>
codebook:node:<non-empty node type id>
codebook:edge:<non-empty edge type id>
codebook:ego
assets
```

Colons inside stage and type IDs are data after the fixed prefix. Consumers
MUST NOT split those suffixes on additional colons.

Every section MUST pass its section-specific schema. A stage document's `id`
MUST equal the suffix of its `stage:<id>` section ID. When `stageOrder` is
present, it MUST name every included stage exactly once and no absent stage.
The `stageOrder` section defines execution order; manifest ordering is only
canonical section-ID order. For a `protocol` template, the assembled sections
and all cross-section references MUST validate as a complete protocol. Other
template kinds MAY carry only a reusable subset plus supporting sections, but
MUST contain exactly one qualifying section with the following subject matter.
That unique section is the reusable artifact's primary identity; other sections
are supporting content:

- `stage`: a stage section;
- `entity_definition`: an ego, node, or edge codebook definition;
- `variable_set`: an ego, node, or edge codebook definition with at least one
  variable; and
- `generator_prompt_set`: a supported generator stage with at least one prompt
  that creates nodes or edges. A display-only sociogram prompt is insufficient.

## Assets and executable-content exclusion

Every asset definition in the `assets` section MUST resolve to a manifest asset
with the same source and media class. Every manifest asset MUST be used by that
section. All asset references elsewhere in the sections MUST resolve to an
included asset definition. API-key asset definitions are forbidden.

Binary media MUST be identified from its bytes, not only the declared media
type. Version 1 uses the ordered detection algorithm of `file-type` **22.0.2**,
`fileTypeFromBuffer(bytes)` with its default options, as a normative algorithm
reference for every binary type below. The exact npm source archive is
`https://registry.npmjs.org/file-type/-/file-type-22.0.2.tgz`; its integrity is
`sha512-0H8TsCUGBLx+V5adH3EY52hTAcyLKbV1D4gq5cIOJ6DnQAHeV9Z2Hhuc5CoBX4YmvB2oL+JIC84z0qO7JsCoNw==`.
The algorithm is in `source/index.js` and its `source/detectors/` modules.
Independent implementations MAY port that algorithm, but MUST preserve its
ordered tests, offsets, defaults, and failure behavior. This reference retains
the dependency's own software license.

Normalize only these detected MIME aliases: `audio/ogg; codecs=opus` to
`audio/ogg`, `audio/x-m4a` to `audio/mp4`, and `video/x-m4v` to `video/mp4`.
The normalized MIME MUST equal the declared MIME exactly, and its class MUST
match the table. An exception or absent/unsupported detection MUST reject the
asset. Container classification follows the detector's header procedure;
readers MUST NOT substitute track enumeration or a different mixed-track rule.
For example, Ogg classification uses the identification bytes beginning at
byte offset 28: Opus, FLAC, Speex and Vorbis identify audio; Theora and the
OGM video marker identify video. An unrecognized Ogg header is rejected.
ISO BMFF classification uses the initial `ftyp` major brand: `M4A`, `M4B`,
`F4A` and `F4B` identify audio; `avif` and `avis` identify AVIF images;
remaining MP4 brands use the exact ordered exclusions and video fallback in
the pinned algorithm. Later audio/video tracks do not change this classification.

The following declarations are allowed:

| Class     | Media types                                                                      |
| --------- | -------------------------------------------------------------------------------- |
| `image`   | `image/png`, `image/apng`, `image/jpeg`, `image/gif`, `image/webp`, `image/avif` |
| `audio`   | `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/aac`, `audio/flac`, `audio/mp4`   |
| `video`   | `video/mp4`, `video/webm`, `video/ogg`                                           |
| `dataset` | `text/csv`, `application/json`, `application/geo+json`                           |

Dataset bytes MUST be valid UTF-8. Before validating decoded dataset text,
readers MUST remove exactly one initial UTF-8 BOM byte sequence (`EF BB BF`),
if present at byte offset zero. No other U+FEFF character is removed. In
particular, JSON and GeoJSON with a second initial BOM or a BOM after leading
whitespace are invalid JSON. The original bytes, including any initial BOM,
MUST remain unchanged in the archive and in the asset hash input.

The decoded dataset text MUST be non-empty and contain no disallowed C0
controls. The permitted C0 controls are only TAB (U+0009), LF (U+000A),
and CR (U+000D); U+0000–U+0008, U+000B–U+000C, and U+000E–U+001F are
forbidden. CSV MUST consist of one or more records separated by LF or CRLF;
a final separator is optional, and lone CR is invalid. A record consists of
one or more comma-separated fields. An unquoted field contains any admitted
Unicode character except comma, double quote, CR, or LF. A quoted field starts
and ends with a double quote; inside it, commas, LF, CRLF, and Unicode text are
allowed, and a literal double quote is represented by two consecutive double
quotes. A double quote in an unquoted field, an unclosed quoted field, or any
text between a closing quote and the following comma, record separator, or end
of input is invalid. Every record MUST have the same number of fields as the
first record. A blank line is a record containing one empty field, so it is
valid only in a one-field CSV; a final record separator does not create a blank
record. These rules are validated in linear time with constant auxiliary
space.

CSV whose first non-whitespace character is `<` is also invalid. This rejects
HTML, XML, SVG, comments, processing instructions, and other markup regardless
of its first token. The leading-markup check MUST be the ECMAScript regular
expression `/^\s*</` applied to the decoded JavaScript string, without the
Unicode (`u`) flag. Here `^` anchors the input and `\s*` consumes zero or more
ECMAScript whitespace code points. For this version, ECMAScript `\s` means
exactly U+0009–U+000D, U+0020, U+00A0, U+1680, U+2000–U+200A, U+2028, U+2029,
U+202F, U+205F, U+3000, and U+FEFF.
JSON datasets MUST decode to an object or array. JSON and GeoJSON dataset
objects MUST NOT contain duplicate member names, including names that become
equal after decoding JSON escapes, at any nesting level. Their decoded member
names and string values MUST NOT contain NUL or unpaired Unicode surrogates.
Every decoded number at every depth MUST be finite under the ECMAScript
`Number` model. This includes GeoJSON properties and foreign members, not only
coordinates, bounding boxes, and feature IDs.
Every decoded value MUST satisfy the same depth limit as canonical JSON above.
Dataset JSON need not use canonical member ordering, escaping, or whitespace;
its original bytes, including insignificant whitespace, remain the asset hash
input.

GeoJSON MUST decode to an object whose `type` is one of `FeatureCollection`,
`Feature`, `Point`, `MultiPoint`, `LineString`, `MultiLineString`, `Polygon`,
`MultiPolygon`, or `GeometryCollection`. A type name alone is insufficient:
the corresponding structure MUST validate recursively. Positions are arrays
of at least two finite numbers; LineStrings contain at least two positions;
linear rings contain at least four positions whose first and last positions
have the same length and element-wise equal coordinates under ECMAScript
Number strict equality (`===`); consequently `0` and `-0` are equal. MultiPoint,
MultiLineString, Polygon, and MultiPolygon contain the
corresponding arrays of positions, lines, rings, and non-empty ring arrays.
A geometry's `coordinates` MAY be an empty array. GeometryCollections require
a `geometries` array containing only geometry objects. Features require both
`geometry` (a geometry object or null) and `properties` (an object or null);
an optional `id` is a string or finite number. FeatureCollections require a
`features` array containing only Features. Empty collection arrays are valid.
Foreign members remain permitted and their descendants are ordinary JSON.
Geometry objects MUST NOT carry `geometry`, `properties`, or `features`;
Features MUST NOT carry `coordinates`, `geometries`, or `features`;
FeatureCollections MUST NOT carry `coordinates`, `geometries`, `geometry`,
or `properties`. Only GeometryCollection uses `geometries`; other geometry
types use `coordinates` and MUST NOT carry `geometries`, while
GeometryCollection MUST NOT carry `coordinates`.

This profile requires all non-empty positions in a GeoJSON object's recursive
geometry tree to have the same dimension count `n`. An optional `bbox` MUST
contain exactly `2*n` finite numbers. For an entirely empty or null geometry
tree, where `n` is unknown, `bbox` MAY contain any even number of finite
numbers of at least four. Each object's `bbox` uses dimensions from that
object's own recursive geometry tree. An empty nested geometry does not inherit
dimensions from a non-empty sibling or enclosing collection, so its own `bbox`
uses the unknown-dimension rule even when the enclosing tree establishes `n`.
The structural rules follow
[RFC 7946 sections 3, 5, and 7.1](https://www.rfc-editor.org/rfc/rfc7946.html);
the consistent-dimension rule is this exchange profile's portability constraint.

The allowlist excludes scripts, HTML, SVG, arbitrary binaries, and embedded API
credentials. A consumer MUST reject an unknown media type, a declared class
that disagrees with the detected bytes, or an unused payload.

## Resource limits

A version 1 reader MUST enforce these upper bounds:

| Resource                                            |        Limit |
| --------------------------------------------------- | -----------: |
| Compressed archive                                  |       25 MiB |
| Total uncompressed bytes                            |       32 MiB |
| One asset                                           |       10 MiB |
| One section                                         |        1 MiB |
| `manifest.json`, `metadata.json`, or `license.json` | 128 KiB each |
| Section references                                  |          512 |
| Asset references                                    |          128 |
| ZIP entries                                         |        1,024 |

Limits apply to declared values and observed decompression output. Exceeding a
limit invalidates the complete artifact.

## Verification procedure

A conforming verifier performs the following checks before exposing or storing
content:

1. Apply the ZIP profile and resource limits, including local/central directory
   consistency and bounded streaming decompression.
2. Require exactly the permitted, referenced file set.
3. Parse manifest, metadata, license, and section files as canonical JSON.
   Reject unknown members wherever the applicable schema defines a closed
   object; dataset assets follow the separate dataset rules above.
4. Require `format` and `format_version` to identify this specification.
5. Reject an unsupported `protocol_schema_version` with a versioned error.
6. Validate the manifest, metadata, and license shapes.
7. Recompute `metadata_hash`, `license_hash`, every section hash, every asset
   hash and byte size, and `merkle_root`.
8. Validate every section and cross-section reference under the declared
   protocol schema and enforce the template-kind requirement.
9. Detect asset media from bytes, apply the media allowlist, reject API-key
   definitions, and prove that all asset definitions and payloads are used.

No partially verified file is a valid artifact. Registry intake and instance
import MUST apply the same verification boundary. The registry entry UUID,
publisher account, curation state, reports, yank state, and moderation state are
registry records and do not participate in `merkle_root`.

Yanking a publication removes its entry from browse and search while a direct
fetch by `merkle_root` can continue to return the verified artifact with a yank
notice. Operator hard deletion can make the bytes unavailable, but it does not
change the identity of bytes already obtained.

## Versioning

`format_version` versions this container contract. Writers MUST emit version 1
exactly. Readers MUST reject an unsupported format version rather than guessing
at compatibility. `protocol_schema_version` independently versions the schema
used by the contained sections.

Additive or breaking changes to closed objects, entry names, hashing,
canonicalization, or verification rules require a new format version. Registry
API evolution is versioned separately by its `/api/v1/` path and OpenAPI
contract.
