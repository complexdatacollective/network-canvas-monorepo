# Spanish (es) documentation glossary

Terms the Spanish documentation uses for Network Canvas concepts. They are
taken from the Spanish catalogs the apps already ship (Architect, Interviewer,
Fresco and the shared packages), so a page names a screen, button or setting
the same way the reader sees it in the app. Where the catalogs disagree, the
term used most often wins and the table says so.

When a page needs a term that is not here, look for it in the app catalogs
first (`apps/*/src/locales/es.json`, `packages/*/src/locales/es.json`), then
add it here in the same change as the page that first uses it.

## Register

Address the reader as **tú**, as the apps do, so instructions read the same as
the screens they describe. Prefer impersonal phrasing ("se puede…", "para añadir…") where
it reads naturally. The Spanish uses Spain's conventions, as the app catalogs
do (for example "vídeo", "añadir").

## Never translated

Network Canvas, Architect, Interviewer, Fresco, Studio, Network Canvas
Interviewer, file formats (`.netcanvas`, CSV, GraphML), and anything inside
code blocks or inline code.

## Concepts

| English                     | Spanish                | Notes                                                                                 |
| --------------------------- | ---------------------- | ------------------------------------------------------------------------------------- |
| alter (alters)              | álter (álteres)        |                                                                                       |
| attribute                   | atributo               |                                                                                       |
| case ID                     | ID del caso            |                                                                                       |
| codebook                    | libro de códigos       |                                                                                       |
| edge                        | vínculo                | Not "arista". The apps use "vínculo" throughout.                                      |
| edge type                   | tipo de vínculo        |                                                                                       |
| ego                         | ego                    | "atributos de ego", "formulario del ego"                                              |
| entity                      | entidad                |                                                                                       |
| export                      | exportar / exportación |                                                                                       |
| filter                      | filtro / filtrar       |                                                                                       |
| form                        | formulario             |                                                                                       |
| interface                   | interfaz (interfaces)  |                                                                                       |
| interview                   | entrevista             |                                                                                       |
| layout                      | disposición            |                                                                                       |
| network                     | red                    |                                                                                       |
| node                        | nodo                   |                                                                                       |
| node type                   | tipo de nodo           |                                                                                       |
| options                     | opciones               |                                                                                       |
| panel                       | panel                  |                                                                                       |
| participant                 | participante           |                                                                                       |
| piped text                  | texto dinámico         |                                                                                       |
| preview                     | vista previa           |                                                                                       |
| prompt                      | pregunta               | The apps use "pregunta" in all but one place ("indicación"); use "pregunta".          |
| protocol                    | protocolo              |                                                                                       |
| quick add                   | adición rápida         |                                                                                       |
| researcher                  | (no app term)          | The website writes "quienes investigan"; prefer that or "el equipo de investigación". |
| resource, asset             | recurso                | The apps translate both as "recurso".                                                 |
| roster                      | lista                  | "datos de una lista", "panel de la lista"                                             |
| schema                      | esquema                | "versión del esquema"                                                                 |
| session                     | sesión                 |                                                                                       |
| skip logic                  | lógica de salto        |                                                                                       |
| sociogram                   | sociograma             |                                                                                       |
| stage                       | etapa                  |                                                                                       |
| validation                  | validación             |                                                                                       |
| variable                    | variable               | The apps say "atributo" for what the docs call a variable; keep "variable" in prose.  |
| visualization presets       | vistas predefinidas    |                                                                                       |
| bin (in the bin interfaces) | contenedor             |                                                                                       |
| categorical / ordinal       | categórico / ordinal   |                                                                                       |

## Interface names

| English                        | Spanish                                    |
| ------------------------------ | ------------------------------------------ |
| Anonymisation                  | Interfaz de anonimización                  |
| Categorical Bin                | Clasificación por categorías               |
| Dyad Census                    | Censo de díadas                            |
| Ego Form                       | Formulario del ego                         |
| Family Pedigree                | Genealogía familiar                        |
| Geospatial                     | Interfaz geoespacial                       |
| Information                    | Información                                |
| Name Generator                 | Generador de nombres                       |
| Name Generator (quick add)     | Generador de nombres (adición rápida)      |
| Name Generator (using forms)   | Generador de nombres (con formularios)     |
| Name Generator for Roster Data | Generador de nombres a partir de una lista |
| Narrative                      | Narrativa                                  |
| One to Many Dyad Census        | Censo de díadas de uno a varios            |
| Ordinal Bin                    | Clasificación ordinal                      |
| Per Alter Edge Form            | Formulario de vínculos por álter           |
| Per Alter Form                 | Formulario por álter                       |
| Sociogram                      | Sociograma                                 |
| Tie-Strength Census            | Censo de intensidad de vínculos            |

## Not yet settled

These appear in the documentation but have no translation in the apps. Decide
each when the first page that needs it is translated, and record it above.

- name interpreter
