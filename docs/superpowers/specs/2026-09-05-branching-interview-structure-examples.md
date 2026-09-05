# Branching Interview Structure: Scenario Examples

Companion to `2026-09-05-branching-interview-structure-design.md`. Each
scenario shows the Schema 9 `timeline` for one routing pattern, the
route a participant takes, and, where it matters, the Schema 8 protocol it
migrates from.

Conventions, so the examples stay readable:

- `timeline` replaces `stages`; every item carries `kind`.
- IDs are shortened to read (`stage-intro`). Real protocols carry UUIDs
  (#1523).
- Participant-facing strings are `LocalizedString` (#1475), shown with one
  `en` entry. Author-facing labels on decision points and outcomes are plain
  strings.
- Stage configuration that has nothing to do with routing is elided as
  `"…": "…"`.
- Condition node shapes follow #1537 §3 and are illustrative until #1661
  fixes the final property names. Four sources appear below: an ego attribute
  (`attribute` with role `ego`), a network query (today's rule set, operator
  `MATCHES`), a network count (`networkCount`), and the missing-value
  operators from #1536 §7.
- Link targets: `{ "kind": "next" }` is the following item; `{ "kind":
"item", "itemId" }` is a later sibling; `{ "kind": "exit" }` leaves the
  enclosing group at its exit point and is valid only inside a group.

## 1. A linear protocol after migration

A Schema 8 protocol with no skip logic. Migration tags each stage, renames
the array, and appends the finish stage with today's built-in text.

```json
{
  "schemaVersion": 9,
  "name": "Personal networks",
  "codebook": { "…": "…" },
  "timeline": [
    {
      "kind": "stage",
      "id": "stage-intro",
      "type": "Information",
      "label": { "en": "Introduction" },
      "…": "…"
    },
    {
      "kind": "stage",
      "id": "stage-people",
      "type": "NameGenerator",
      "label": { "en": "People you know" },
      "…": "…"
    },
    {
      "kind": "stage",
      "id": "stage-relationships",
      "type": "Sociogram",
      "label": { "en": "Relationships" },
      "…": "…"
    },
    {
      "kind": "stage",
      "id": "stage-finish",
      "type": "FinishSession",
      "label": { "en": "Finish Interview" },
      "title": { "en": "Finish Interview" },
      "content": {
        "en": "You have reached the end of the interview. If you are satisfied with the information you have entered, you may finish the interview now."
      },
      "outcome": "completed"
    }
  ]
}
```

Route: every participant sees all three stages and finishes with outcome
`completed`. Nothing else changes for this protocol.

## 2. Migrated skip logic

The Schema 8 protocol below skips the alter form when no one was named, and
shows the sociogram only when someone was named, otherwise jumping to the
end:

```json
"stages": [
  { "id": "stage-intro", "type": "Information", "…": "…" },
  { "id": "stage-people", "type": "NameGenerator", "…": "…" },
  {
    "id": "stage-alter-form",
    "type": "AlterForm",
    "skipLogic": {
      "action": "SKIP",
      "filter": {
        "join": "AND",
        "rules": [
          { "id": "rule-no-people", "type": "node",
            "options": { "type": "person", "operator": "NOT_EXISTS" } }
        ]
      }
    },
    "…": "…"
  },
  {
    "id": "stage-sociogram",
    "type": "Sociogram",
    "skipLogic": {
      "action": "SHOW",
      "filter": {
        "join": "AND",
        "rules": [
          { "id": "rule-some-people", "type": "node",
            "options": { "type": "person", "operator": "EXISTS" } }
        ]
      },
      "destination": { "type": "finish" }
    },
    "…": "…"
  },
  { "id": "stage-closing", "type": "EgoForm", "…": "…" }
]
```

After migration each skip rule is a decision point placed before its stage.
Three details of §10 show up here: a `SHOW` rule is wrapped in `not`; a
rule with no destination targets the item after its stage, which is the
_next stage's decision point_ when that stage had skip logic of its own, so
destinations still chain; and a `finish` destination targets the appended
finish stage.

```json
"timeline": [
  { "kind": "stage", "id": "stage-intro", "type": "Information", "…": "…" },
  { "kind": "stage", "id": "stage-people", "type": "NameGenerator", "…": "…" },
  {
    "kind": "decision",
    "id": "decision-skip-alter-form",
    "label": "Skip \"Alter form\"",
    "outcomes": [
      {
        "id": "outcome-skip-alter-form",
        "label": "Skip",
        "condition": {
          "id": "condition-no-people",
          "kind": "comparison",
          "source": {
            "kind": "networkQuery",
            "query": {
              "join": "AND",
              "rules": [
                { "id": "rule-no-people", "type": "node",
                  "options": { "type": "person", "operator": "NOT_EXISTS" } }
              ]
            }
          },
          "operator": "MATCHES"
        },
        "target": { "kind": "item", "itemId": "decision-skip-sociogram" }
      }
    ],
    "otherwise": { "kind": "next" }
  },
  { "kind": "stage", "id": "stage-alter-form", "type": "AlterForm", "…": "…" },
  {
    "kind": "decision",
    "id": "decision-skip-sociogram",
    "label": "Skip \"Sociogram\"",
    "outcomes": [
      {
        "id": "outcome-skip-sociogram",
        "label": "Skip",
        "condition": {
          "id": "condition-not-some-people",
          "kind": "not",
          "condition": {
            "id": "condition-some-people",
            "kind": "comparison",
            "source": {
              "kind": "networkQuery",
              "query": {
                "join": "AND",
                "rules": [
                  { "id": "rule-some-people", "type": "node",
                    "options": { "type": "person", "operator": "EXISTS" } }
                ]
              }
            },
            "operator": "MATCHES"
          }
        },
        "target": { "kind": "item", "itemId": "stage-finish" }
      }
    ],
    "otherwise": { "kind": "next" }
  },
  { "kind": "stage", "id": "stage-sociogram", "type": "Sociogram", "…": "…" },
  { "kind": "stage", "id": "stage-closing", "type": "EgoForm", "…": "…" },
  {
    "kind": "stage",
    "id": "stage-finish",
    "type": "FinishSession",
    "label": { "en": "Finish Interview" },
    "title": { "en": "Finish Interview" },
    "content": { "en": "You have reached the end of the interview. …" },
    "outcome": "completed"
  }
]
```

Route with no one named: intro, people, the first decision point fires and
jumps to the second decision point, which also fires and jumps to the finish
stage. Neither the alter form, the sociogram, nor the closing form is shown,
exactly as under Schema 8. Route with someone named: every stage in order.

## 3. An optional module behind one gate

"Show the network-structure section only when at least two people were
named and the participant did not opt out of drawing." One single-outcome
decision point in front of a group is the shape the editor's "show this
only when…" shortcut produces. The condition composes `and` and `not`.

```json
"timeline": [
  { "kind": "stage", "id": "stage-people", "type": "NameGenerator", "…": "…" },
  { "kind": "stage", "id": "stage-about-drawing", "type": "EgoForm",
    "label": { "en": "Drawing your network" }, "…": "writes ego.declinedDrawing" },
  {
    "kind": "decision",
    "id": "decision-structure-gate",
    "label": "Draw the network?",
    "outcomes": [
      {
        "id": "outcome-draw",
        "label": "Two or more people, not opted out",
        "condition": {
          "id": "condition-draw",
          "kind": "and",
          "conditions": [
            {
              "id": "condition-enough-people",
              "kind": "comparison",
              "source": { "kind": "networkCount", "entity": "node", "type": "person" },
              "operator": "GREATER_THAN_OR_EQUAL",
              "value": 2
            },
            {
              "id": "condition-not-declined",
              "kind": "not",
              "condition": {
                "id": "condition-declined",
                "kind": "comparison",
                "source": { "kind": "attribute", "role": "ego", "attributeId": "declinedDrawing" },
                "operator": "EXACTLY",
                "value": true
              }
            }
          ]
        },
        "target": { "kind": "next" }
      }
    ],
    "otherwise": { "kind": "item", "itemId": "stage-closing" }
  },
  {
    "kind": "group",
    "id": "group-structure",
    "label": { "en": "Network structure" },
    "items": [
      { "kind": "stage", "id": "stage-sociogram", "type": "Sociogram", "…": "…" },
      { "kind": "stage", "id": "stage-dyad-census", "type": "DyadCensus", "…": "…" }
    ],
    "exit": { "kind": "next" }
  },
  { "kind": "stage", "id": "stage-closing", "type": "EgoForm", "…": "…" },
  { "kind": "stage", "id": "stage-finish", "type": "FinishSession", "outcome": "completed", "…": "…" }
]
```

Route: the outcome holds, the participant enters the group and its exit
falls through to Closing; the outcome fails, the participant jumps over the
group to Closing.

## 4. Two independent modules, two gates

The answer to "uses drugs _and_ drinks alcohol" (design §6.4). Each module
has its own gate, and each module's exit falls through to the next gate, so
a participant can see both, either, or neither.

```json
"timeline": [
  { "kind": "stage", "id": "stage-about-you", "type": "EgoForm",
    "label": { "en": "About you" }, "…": "writes ego.substanceUse" },
  {
    "kind": "decision",
    "id": "decision-drugs",
    "label": "Drug use?",
    "outcomes": [
      {
        "id": "outcome-drugs",
        "label": "Uses drugs",
        "condition": {
          "id": "condition-drugs",
          "kind": "comparison",
          "source": { "kind": "attribute", "role": "ego", "attributeId": "substanceUse" },
          "operator": "INCLUDES",
          "value": ["drugs"]
        },
        "target": { "kind": "next" }
      }
    ],
    "otherwise": { "kind": "item", "itemId": "decision-alcohol" }
  },
  {
    "kind": "group",
    "id": "group-drugs",
    "label": { "en": "Drug use module" },
    "items": [
      { "kind": "stage", "id": "stage-substances", "type": "CategoricalBin", "…": "…" },
      { "kind": "stage", "id": "stage-used-with", "type": "Sociogram", "…": "…" },
      { "kind": "stage", "id": "stage-frequency", "type": "EgoForm", "…": "…" }
    ],
    "exit": { "kind": "next" }
  },
  {
    "kind": "decision",
    "id": "decision-alcohol",
    "label": "Alcohol use?",
    "outcomes": [
      {
        "id": "outcome-alcohol",
        "label": "Drinks alcohol",
        "condition": {
          "id": "condition-alcohol",
          "kind": "comparison",
          "source": { "kind": "attribute", "role": "ego", "attributeId": "substanceUse" },
          "operator": "INCLUDES",
          "value": ["alcohol"]
        },
        "target": { "kind": "next" }
      }
    ],
    "otherwise": { "kind": "item", "itemId": "stage-closing" }
  },
  {
    "kind": "group",
    "id": "group-alcohol",
    "label": { "en": "Alcohol module" },
    "items": [
      { "kind": "stage", "id": "stage-drinking", "type": "EgoForm", "…": "…" }
    ],
    "exit": { "kind": "next" }
  },
  { "kind": "stage", "id": "stage-closing", "type": "EgoForm", "…": "…" },
  { "kind": "stage", "id": "stage-finish", "type": "FinishSession", "outcome": "completed", "…": "…" }
]
```

Routes: both → drug module, alcohol gate, alcohol module, closing. Drugs
only → drug module, alcohol gate, closing. Alcohol only → alcohol gate,
alcohol module, closing. Neither → closing. Compare the exclusive version of
the same modules in design §16, where one three-outcome decision point
chooses at most one module and the drug module's exit links past the
alcohol module.

## 5. Screening: several early endings

Two decision points end the interview early for different reasons, each at
its own finish stage with its own outcome kind. The first one is the very
first item of the timeline and reads the network as it stands before any
stage, which is how a dynamic roster or starting network (#1653) can be
checked. The second uses a #1536 missing-value operator: a participant who
declined to give an age cannot be screened, which is `terminated`, while
one who is under 18 is `ineligible`.

```json
"timeline": [
  {
    "kind": "decision",
    "id": "decision-roster",
    "label": "Anything to review?",
    "outcomes": [
      {
        "id": "outcome-empty-roster",
        "label": "Roster is empty",
        "condition": {
          "id": "condition-empty-roster",
          "kind": "comparison",
          "source": { "kind": "networkCount", "entity": "node", "type": "contact" },
          "operator": "EXACTLY",
          "value": 0
        },
        "target": { "kind": "item", "itemId": "stage-finish-nothing" }
      }
    ],
    "otherwise": { "kind": "next" }
  },
  { "kind": "stage", "id": "stage-about-you", "type": "EgoForm",
    "label": { "en": "About you" }, "…": "writes ego.age; age accepts a declined response" },
  {
    "kind": "decision",
    "id": "decision-eligibility",
    "label": "Eligibility",
    "outcomes": [
      {
        "id": "outcome-age-declined",
        "label": "Age not given",
        "condition": {
          "id": "condition-age-declined",
          "kind": "comparison",
          "source": { "kind": "attribute", "role": "ego", "attributeId": "age" },
          "operator": "IS_CODED_MISSING"
        },
        "target": { "kind": "item", "itemId": "stage-finish-unscreened" }
      },
      {
        "id": "outcome-under-18",
        "label": "Under 18",
        "condition": {
          "id": "condition-under-18",
          "kind": "comparison",
          "source": { "kind": "attribute", "role": "ego", "attributeId": "age" },
          "operator": "LESS_THAN",
          "value": 18
        },
        "target": { "kind": "item", "itemId": "stage-finish-ineligible" }
      }
    ],
    "otherwise": { "kind": "next" }
  },
  { "kind": "stage", "id": "stage-review-contacts", "type": "NameGeneratorRoster", "…": "…" },
  { "kind": "stage", "id": "stage-closing", "type": "EgoForm", "…": "…" },
  {
    "kind": "stage",
    "id": "stage-finish",
    "type": "FinishSession",
    "label": { "en": "Thank you" },
    "title": { "en": "Thank you" },
    "content": { "en": "That is everything. Press Finish to submit your answers." },
    "outcome": "completed"
  },
  {
    "kind": "stage",
    "id": "stage-finish-nothing",
    "type": "FinishSession",
    "label": { "en": "Nothing to review" },
    "title": { "en": "Nothing to review today" },
    "content": { "en": "We have no contacts on file for you to review. Thank you for checking in." },
    "outcome": "terminated"
  },
  {
    "kind": "stage",
    "id": "stage-finish-unscreened",
    "type": "FinishSession",
    "label": { "en": "Could not screen" },
    "title": { "en": "Thank you for your interest" },
    "content": { "en": "We need your age to confirm that you can take part, so we are unable to continue." },
    "outcome": "terminated"
  },
  {
    "kind": "stage",
    "id": "stage-finish-ineligible",
    "type": "FinishSession",
    "label": { "en": "Not eligible" },
    "title": { "en": "Thank you for your interest" },
    "content": { "en": "This study is open to adults aged 18 and over, so we are unable to continue." },
    "outcome": "ineligible"
  }
]
```

The three early endings sit after the normal finish stage, reachable only
by link; validation rule 9.4 accepts that because each is reached on some
path. Outcome order matters at the eligibility decision: "Age not given" is
checked before "Under 18" so a missing age never compares as a number.

## 6. Nested groups, a decision inside a group, and a finish inside a group

An "Onboarding" group meant to be shared as a template (#1282). It contains
a "Consent" group and an eligibility check. Both groups can end the
interview from inside, so each carries its own finish stage, and both use
the `exit` target to say "otherwise, continue after this group". Links never
leave the group they are in, so the template is self-contained.

```json
"timeline": [
  {
    "kind": "group",
    "id": "group-onboarding",
    "label": { "en": "Onboarding" },
    "description": "Consent, then screening. Shareable as a template.",
    "items": [
      {
        "kind": "group",
        "id": "group-consent",
        "label": { "en": "Consent" },
        "items": [
          { "kind": "stage", "id": "stage-study-info", "type": "Information",
            "label": { "en": "About this study" }, "…": "…" },
          { "kind": "stage", "id": "stage-consent-form", "type": "EgoForm",
            "label": { "en": "Consent" }, "…": "writes ego.consented" },
          {
            "kind": "decision",
            "id": "decision-consent",
            "label": "Consent given?",
            "outcomes": [
              {
                "id": "outcome-declined",
                "label": "Declined",
                "condition": {
                  "id": "condition-declined",
                  "kind": "comparison",
                  "source": { "kind": "attribute", "role": "ego", "attributeId": "consented" },
                  "operator": "EXACTLY",
                  "value": false
                },
                "target": { "kind": "next" }
              }
            ],
            "otherwise": { "kind": "exit" }
          },
          {
            "kind": "stage",
            "id": "stage-finish-declined",
            "type": "FinishSession",
            "label": { "en": "Declined" },
            "title": { "en": "Thank you" },
            "content": { "en": "You have chosen not to take part. No information has been recorded." },
            "outcome": "terminated"
          }
        ],
        "exit": { "kind": "next" }
      },
      { "kind": "stage", "id": "stage-about-you", "type": "EgoForm",
        "label": { "en": "About you" }, "…": "writes ego.age" },
      {
        "kind": "decision",
        "id": "decision-eligibility",
        "label": "Eligibility",
        "outcomes": [
          {
            "id": "outcome-under-18",
            "label": "Under 18",
            "condition": {
              "id": "condition-under-18",
              "kind": "comparison",
              "source": { "kind": "attribute", "role": "ego", "attributeId": "age" },
              "operator": "LESS_THAN",
              "value": 18
            },
            "target": { "kind": "next" }
          }
        ],
        "otherwise": { "kind": "exit" }
      },
      {
        "kind": "stage",
        "id": "stage-finish-ineligible",
        "type": "FinishSession",
        "label": { "en": "Not eligible" },
        "title": { "en": "Thank you for your interest" },
        "content": { "en": "This study is open to adults aged 18 and over." },
        "outcome": "ineligible"
      }
    ],
    "exit": { "kind": "next" }
  },
  { "kind": "stage", "id": "stage-people", "type": "NameGenerator", "…": "…" },
  { "kind": "stage", "id": "stage-finish", "type": "FinishSession", "outcome": "completed", "…": "…" }
]
```

Routes: declining consent ends at "Declined" inside the Consent group.
Consenting takes the `exit` of the Consent group, which falls through to
"About you". Under 18 ends at "Not eligible" inside Onboarding. Otherwise
the `exit` of Onboarding falls through to "People you know". Inserting this
group as a template into another protocol needs only the codebook mapping
for `consented` and `age`; every link inside it is still valid.

## 7. Exclusive streams that rejoin at different places

A three-way split where one stream rejoins early, one rejoins late, and one
ends the interview. Group exits carry the rejoin links; the decision point
only chooses the stream.

```json
"timeline": [
  { "kind": "stage", "id": "stage-role", "type": "EgoForm",
    "label": { "en": "Your role" }, "…": "writes ego.role" },
  {
    "kind": "decision",
    "id": "decision-role",
    "label": "Role",
    "outcomes": [
      {
        "id": "outcome-clinician",
        "label": "Clinician",
        "condition": { "id": "c-clin", "kind": "comparison",
          "source": { "kind": "attribute", "role": "ego", "attributeId": "role" },
          "operator": "EXACTLY", "value": "clinician" },
        "target": { "kind": "item", "itemId": "group-clinician" }
      },
      {
        "id": "outcome-carer",
        "label": "Carer",
        "condition": { "id": "c-carer", "kind": "comparison",
          "source": { "kind": "attribute", "role": "ego", "attributeId": "role" },
          "operator": "EXACTLY", "value": "carer" },
        "target": { "kind": "item", "itemId": "group-carer" }
      }
    ],
    "otherwise": { "kind": "item", "itemId": "stage-finish-other" }
  },
  {
    "kind": "group",
    "id": "group-clinician",
    "label": { "en": "Clinician questions" },
    "items": [
      { "kind": "stage", "id": "stage-clinic-team", "type": "NameGenerator", "…": "…" },
      { "kind": "stage", "id": "stage-clinic-ties", "type": "Sociogram", "…": "…" }
    ],
    "exit": { "kind": "item", "itemId": "stage-shared-closing" }
  },
  {
    "kind": "group",
    "id": "group-carer",
    "label": { "en": "Carer questions" },
    "items": [
      { "kind": "stage", "id": "stage-care-network", "type": "NameGenerator", "…": "…" }
    ],
    "exit": { "kind": "next" }
  },
  { "kind": "stage", "id": "stage-carer-support", "type": "EgoForm",
    "label": { "en": "Support for carers" }, "…": "…" },
  { "kind": "stage", "id": "stage-shared-closing", "type": "EgoForm",
    "label": { "en": "Closing questions" }, "…": "…" },
  { "kind": "stage", "id": "stage-finish", "type": "FinishSession", "outcome": "completed", "…": "…" },
  {
    "kind": "stage",
    "id": "stage-finish-other",
    "type": "FinishSession",
    "label": { "en": "Not in scope" },
    "title": { "en": "Thank you" },
    "content": { "en": "This interview is for clinicians and carers." },
    "outcome": "ineligible"
  }
]
```

Routes: clinicians do their group and rejoin at Closing questions, skipping
the carer support form. Carers do their group, fall through to Support for
carers, then Closing questions. Anyone else ends at "Not in scope".

## 8. Condition sources at a glance

Every condition is a #1537-style node. The sources a decision point may use:

| Source             | Shape (illustrative)                                                   | Reads                                              |
| ------------------ | ---------------------------------------------------------------------- | -------------------------------------------------- |
| Ego attribute      | `{ "kind": "attribute", "role": "ego", "attributeId": "age" }`         | one ego value; operators by attribute type         |
| Network query      | `{ "kind": "networkQuery", "query": { "join", "rules" } }` + `MATCHES` | today's skip-logic rule set over nodes, edges, ego |
| Network count      | `{ "kind": "networkCount", "entity": "node", "type": "person" }`       | a count, compared with numeric operators           |
| Interview metadata | `{ "kind": "metadata", "path": "interview.caseId" }`                   | an allow-listed value from the #1522 registry      |

Missing-value operators (`IS_CODED_MISSING`, `MISSING_REASON_IS`,
`IS_UNANSWERED`, and the missing-aware `EXISTS` / `NOT_EXISTS`) apply
wherever the source can hold an attribute value. `and`, `or`, and `not`
nest to any depth. No source refers to a form field or to a node or edge
role, because no single entity is in context on the timeline.
