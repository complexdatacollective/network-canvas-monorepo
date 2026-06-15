# Transnational Networks — authoring notes

## Rationale

This template operationalises the personal-network approach to migrant integration, in which
the _composition_ and _structure_ of an ego's network — how much of it sits in the host society
versus the country of origin or elsewhere abroad — index structural assimilation and
transnationalism above and beyond individual traits (Vacca, Solano, Lubbers, Molina & McCarty,
_Social Networks_, 2018). The signature design is a **pair of name generators** — one eliciting
important ties _here_ in the host country, one eliciting ties in the _origin country and
elsewhere abroad_ — followed by a **Geospatial world-map stage** on which each alter is placed in
the country where they currently live, so the spread of the network across borders becomes
directly measurable. Alter attributes (relationship, co-ethnicity, shared language, where/how the
tie was formed, support provided, closeness) and an alter–alter `knows` census support standard
composition and density analyses, while the ego form captures birth country, arrival year, years
since migration, residency status, host-language proficiency, and a single acculturative-stress
item for context. Elicitation wording is adapted from the EgoNet / binational personal-network
tradition, and the `support_type` categories are adapted from the four dimensions of the MOS
Social Support Survey (emotional, practical/tangible, informational, financial/affectionate).

## Instruments and sources

- **Personal-network migration design & name-generator construction** — Vacca R, Solano G,
  Lubbers MJ, Molina JL, McCarty C. _A personal network approach to the study of immigrant
  structural assimilation and transnationalism._ Social Networks. 2018;53:72–89.
  https://www.researchgate.net/publication/309153406_A_Personal_Network_Approach_to_the_Study_of_Immigrant_Structural_Assimilation_and_Transnationalism
- **Practical name-generator / name-interpreter guidance** — McCarty C, Lubbers MJ, Vacca R,
  Molina JL. _Conducting Personal Network Research: A Practical Guide._ Guilford Press, 2019.
  https://www.guilford.com/books/Conducting-Personal-Network-Research/McCarty-Lubbers-Vacca-Molina/9781462538386/authors
- **Geographically-anchored migrant name generators** (eliciting ties by place of residence:
  current location, origin country, and other locations abroad) — Vacca R, et al. _Measuring
  transnational social fields through binational link-tracing sampling._ PLoS ONE / PMC8202912.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC8202912/
- **Social-support typology for `support_type` and the host-country support prompts** — MOS Social
  Support Survey (four dimensions: emotional/informational, tangible, affectionate, positive social
  interaction). Sherbourne CD, Stewart AL. _The MOS social support survey._ Soc Sci Med.
  1991;32(6):705–714. RAND reprint: https://www.rand.org/pubs/reprints/RP218.html ;
  item summary (UCSF Center for Aging in Diverse Communities): https://cadc.ucsf.edu/social-support
- **Software design context** — Hogan B, et al. _Network Canvas: Key decisions in the design of an
  interviewer-assisted network data collection software suite._ Social Networks. 2021.

All wording was _adapted_ (paraphrased and shortened for an interviewer-assisted, plain-language
context), not copied verbatim, so no licensed instrument text is reproduced in the protocol.

## Geospatial stage — required assets (attach in Architect)

The Geospatial stage validates with placeholder asset-id strings, but it will only **run** once a
researcher attaches two assets in Architect and points the stage's `mapOptions` at them:

1. **A Mapbox access token** asset — referenced by `mapOptions.tokenAssetId`
   (placeholder `"mapbox-access-token"`). Obtain a free token at https://account.mapbox.com/ .
   The configured base style is `mapbox://styles/mapbox/light-v11`.
2. **A world-countries boundary GeoJSON** asset — referenced by `mapOptions.dataSourceAssetId`
   (placeholder `"world-countries-geojson"`). Each country feature must expose a `name` property,
   because the stage's `targetFeatureProperty` is set to `"name"`. A suitable openly-licensed
   source is the Natural Earth Admin 0 – Countries dataset (public domain), e.g. the
   world-atlas / countries-110m TopoJSON or a GeoJSON conversion of Natural Earth:
   - Natural Earth (public domain): https://www.naturalearthdata.com/downloads/110m-cultural-vectors/
   - world-atlas (TopoJSON, ISC licence): https://github.com/topojson/world-atlas
   - Plain GeoJSON convenience copy (datahub.io, public domain): https://datahub.io/core/geo-countries

The map is centred on `[0, 20]` at `initialZoom: 1` so the whole world is visible for placing both
host-country and transnational alters.

## Suggested openly-licensed images (optional — not embedded)

The template uses only text content, per the authoring guide. If a researcher wishes to add a
welcome image to the Information stage, the following are openly licensed (verify the licence at
time of use); do not embed without attaching as an Architect asset:

- Unsplash (free licence, https://unsplash.com/license) — search "world map", "passport",
  "family", e.g. https://unsplash.com/s/photos/world-map
- Wikimedia Commons world map (public domain): a blank/equirectangular world map such as
  https://commons.wikimedia.org/wiki/File:BlankMap-World.svg
- Pexels (free licence, https://www.pexels.com/license/): https://www.pexels.com/search/migration/
