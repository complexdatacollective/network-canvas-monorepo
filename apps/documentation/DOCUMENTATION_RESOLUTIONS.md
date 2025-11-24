# Documentation Resolutions and Style Guide
**Network Canvas Documentation**
**Established:** November 18, 2025
**Authority:** This document establishes official decisions for all documentation style questions

---

## Table of Contents
1. [Terminology Standards](#terminology-standards)
2. [Capitalization Rules](#capitalization-rules)
3. [Voice and Tone](#voice-and-tone)
4. [Formatting Standards](#formatting-standards)
5. [Structural Standards](#structural-standards)
6. [Content Organization](#content-organization)
7. [Cross-Referencing Standards](#cross-referencing-standards)
8. [Resolved Ambiguities](#resolved-ambiguities)

---

## 1. Terminology Standards

### 1.1 Product Names (Always Capitalize)

| Term | Standard | Usage |
|------|----------|-------|
| Architect | Always capitalize | "Open Architect to design your protocol" |
| Interviewer | Always capitalize | "Install Interviewer on your tablet" |
| Fresco | Always capitalize | "Deploy Fresco to your server" |
| Network Canvas | Always capitalize both words | "Network Canvas provides tools for network data collection" |

**Rule:** Product names are proper nouns and always capitalized, whether at the start of a sentence or mid-sentence.

**Examples:**
- ✅ "You can use Architect to build protocols"
- ✅ "The Interviewer application runs on tablets"
- ✅ "Network Canvas Interviewer is available for download"
- ✗ "The architect software" (incorrect - use "Architect" or "the Architect application")
- ✗ "interviewer" when referring to the product

### 1.2 Generic Technical Terms (Lowercase)

| Term | Standard | Usage |
|------|----------|-------|
| protocol | Lowercase unless start of sentence | "The protocol contains five stages" |
| stage | Lowercase unless start of sentence | "Add a new stage to your protocol" |
| interface | Lowercase unless specific type | "The interface allows data collection" BUT "the Name Generator interface" |
| node | Always lowercase | "Each node represents an alter" |
| alter | Always lowercase | "Participants nominate alters" |
| edge | Always lowercase | "Create an edge between nodes" |
| tie | Always lowercase | "The tie represents a relationship" |
| ego | Always lowercase | "Collect ego data on this stage" |
| variable | Lowercase unless start of sentence | "Create a new variable for this field" |
| field | Lowercase unless start of sentence | "Add fields to the form" |
| form | Lowercase unless start of sentence | "The form collects alter data" |

**Rule:** Common technical terms are not proper nouns and use standard capitalization rules.

### 1.3 Interface Names (Mixed Case)

| Term | Standard | Reasoning |
|------|----------|-----------|
| Name Generator | Capitalize both words | Specific interface type |
| Ego Form | Capitalize both words | Specific interface type |
| Per-Alter Form | Capitalize all major words | Specific interface type |
| Sociogram | Capitalize as proper name | Specific interface type |
| Categorical Bin | Capitalize both words | Specific interface type |
| Ordinal Bin | Capitalize both words | Specific interface type |
| Information interface | Only "Information" capitalized | Generic "interface" stays lowercase |

**Rule:** When referring to specific Interface types as proper names, capitalize major words. When using "interface" generically, keep it lowercase.

**Examples:**
- ✅ "Add a Name Generator interface to your protocol"
- ✅ "The Ego Form interface collects participant data"
- ✅ "Use an interface to collect data" (generic)
- ✅ "The Sociogram shows network relationships"

### 1.4 Input Control Names

| Term | Standard |
|------|----------|
| Text Input | Capitalize both words when referring to specific control type |
| Text Area | Capitalize both words when referring to specific control type |
| Number Input | Capitalize both words when referring to specific control type |
| Radio Button Group | Capitalize all major words |
| Checkbox Group | Capitalize both words |
| Date Picker | Capitalize both words |
| Likert Scale | Capitalize both words |
| Visual Analog Scale | Capitalize all words (VAS acceptable in parentheses after first use) |
| Toggle | Capitalize |
| Toggle Button Group | Capitalize all major words |

**Rule:** Input control types are specific named controls and should be capitalized.

### 1.5 Participant vs. Researcher Terminology

| Context | Preferred Term | Alternative (Acceptable) | Avoid |
|---------|---------------|-------------------------|--------|
| Person being interviewed | participant | respondent | subject, user |
| Person conducting interview | researcher, interviewer (human) | investigator | administrator |
| Network members | alters | network members | contacts, nominees |
| Central person | ego, participant | | |
| Naming process (technical) | node creation | name generation | |
| Naming process (participant-facing) | nominating alters | naming people | adding contacts |
| Relationships (technical) | edges | ties | links, connections |
| Relationships (conceptual) | ties, relationships | | |

**Rule:** Use technical terms (nodes, edges) in researcher documentation. Use more accessible terms (alters, relationships) when describing participant experience.

### 1.6 Interview Terms

| Term | Standard Usage | Context |
|------|---------------|---------|
| interview | General process | "The interview takes 30 minutes" |
| interview session | Specific instance | "Resume the interview session" |
| session | Short form acceptable after first use | "The session was paused" |
| case | Refers to case ID | "Enter a unique case ID" |
| interview protocol | Full formal term | First mention in documents |
| protocol | Short form | After first mention |

**Resolution:** Use "interview session" when referring to a specific instance, "interview" for general process, and "protocol" for the designed interview structure.

---

## 2. Capitalization Rules

### 2.1 UI Elements

**Rule:** Bold but do not capitalize UI elements unless they are capitalized in the actual interface.

**Examples:**
- ✅ Click the **Add New Stage** button
- ✅ Open the **Manage codebook** dialog
- ✅ Select **File → Save**
- ✗ Click the **add new stage** button (if UI shows capitals)
- ✗ Click the **Add New Stage** Button (don't capitalize "button")

### 2.2 Headings

**Rule:** Use sentence case for all headings (capitalize first word and proper nouns only).

**Examples:**
- ✅ ## Creating a new protocol
- ✅ ## Using Architect to design interviews
- ✅ ## Name Generator interfaces
- ✗ ## Creating A New Protocol
- ✗ ## Using Architect To Design Interviews

### 2.3 Section Names

**Rule:** When referring to sections of the interface or documentation, capitalize only proper nouns.

**Examples:**
- ✅ "The protocols section"
- ✅ "In the Key Concepts section"
- ✅ "See the start screen"
- ✗ "The Protocols Section" (unless quoting UI)

---

## 3. Voice and Tone

### 3.1 Active vs. Passive Voice

**Resolution:** Use active voice unless passive voice is specifically more appropriate.

**Active voice preferred:**
- ✅ "Click the button to save your work"
- ✅ "Architect validates the protocol automatically"
- ✅ "You can configure skip logic on any stage"
- ✗ "The button can be clicked to save your work"
- ✗ "The protocol is validated automatically by Architect"
- ✗ "Skip logic can be configured on any stage"

**Passive voice acceptable when:**
1. The actor is unknown or unimportant: "The data is stored securely"
2. Emphasizing the object: "Protocols are designed in Architect, then deployed in Interviewer"
3. Describing system behavior: "Error messages are displayed next to invalid fields"

### 3.2 Person (First, Second, Third)

**Resolution:** Use second person ("you") for instructions and general guidance.

**Examples:**
- ✅ "You can create multiple protocols"
- ✅ "If you want to collect detailed data, use forms"
- ✗ "One can create multiple protocols"
- ✗ "The researcher can create multiple protocols" (except in conceptual explanations)
- ✗ "We recommend using forms" (prefer "Use forms" or "You should use forms")

**Exception:** Use first person plural ("we") only when speaking as the Network Canvas team making recommendations:
- ✅ "We recommend disabling automatic updates"
- ✅ "We have observed that shorter forms improve completion rates"

### 3.3 Formality Level

**Resolution:** Professional but approachable. Avoid overly academic language while maintaining technical accuracy.

**Preferred style:**
- ✅ "Network filtering helps reduce participant burden by showing only relevant network members"
- ✅ "Use skip logic to create adaptive interviews"
- ✗ "The utilization of network filtering facilitates the amelioration of respondent burden through the selective presentation of salient network entities" (too academic)
- ✗ "Network filtering is super cool because it makes things way easier!" (too casual)

**Guidelines:**
- Use contractions sparingly (can't, don't) - avoid in formal explanations, acceptable in examples
- Avoid jargon unless necessary and defined
- Explain technical concepts in plain language first
- Use examples to illustrate abstract concepts

### 3.4 Instructional Tone

**Resolution:** Direct, helpful, and empowering. Avoid condescension.

**Examples:**
- ✅ "To add a stage, click the **Add New Stage** button"
- ✅ "Consider using validation to ensure data quality"
- ✅ "Test your protocol in Preview Mode before deploying"
- ✗ "Simply click the **Add New Stage** button" (avoid "simply" - implies it's obvious)
- ✗ "Obviously, you should test first" (condescending)
- ✗ "Be sure to..." (prefer "Ensure that you" or just state the action)

---

## 4. Formatting Standards

### 4.1 Text Emphasis

| Purpose | Format | Example |
|---------|--------|---------|
| UI elements | **Bold** | Click the **Save** button |
| Emphasis | *Italic* | This is *particularly* important |
| Code, filenames, technical terms | `Code` | The `.netcanvas` file |
| Participant-visible text | > Blockquote | > "Who are your close friends?" |
| Keyboard shortcuts | `Code` with + | Press `Ctrl+S` to save |
| Menu paths | Bold with → | Select **File → Open** |
| New/important terms (first use) | **Bold** | **Skip logic** determines whether a stage appears |

**Never combine formats:** Don't use ***bold italic*** or **`bold code`**

### 4.2 Lists

**Numbered lists** - Use when order matters or for sequential steps:
1. First, open Architect
2. Next, create a new protocol
3. Finally, save your work

**Bulleted lists** - Use when order doesn't matter:
- Protocols
- Stages
- Variables

**Nested lists** - Indent consistently, alternate markers:
- Main point
  - Sub-point
  - Another sub-point
- Another main point

### 4.3 Code Blocks

**Inline code:** Use `backticks` for:
- File names: `.netcanvas`
- Variable names: `close_friend`
- Technical values: `true`, `false`
- Paths: `/docs/desktop/`

**Code blocks:** Use triple backticks with language for:
- Examples
- CSV structures
- JSON configurations

````markdown
```csv
identifier,label
abc123,Participant One
def456,Participant Two
```
````

### 4.4 Links

**Internal links** - Always use relative paths:
- ✅ `[skip logic](/en/desktop/key-concepts/skip-logic)`
- ✗ `[skip logic](https://docs.networkcanvas.com/en/desktop/key-concepts/skip-logic)`

**External links** - Use full URLs:
- ✅ `[R package](https://cran.r-project.org/package=ideanet)`

**Link text** - Should be descriptive:
- ✅ `See the [building a protocol tutorial](/en/desktop/tutorials/building-a-protocol)`
- ✗ `See [here](/en/desktop/tutorials/building-a-protocol)` or `Click [this link](...)`

### 4.5 Images and Diagrams

**Alt text** - Always provide descriptive alt text:
```markdown
![The Architect start screen showing protocol options](/assets/img/architect-start.png)
```

**Captions** - Use the title parameter for captions:
```markdown
![Description](/path/to/image.png 'Caption text')
```

**Full-width images** - Use the component:
```markdown
<ImageFullWidth src="/path" alt="Description" />
```

---

## 5. Structural Standards

### 5.1 Document Structure

**Every document should include:**

1. **Frontmatter:**
```yaml
---
title: Clear, Descriptive Title
navOrder: [number] (optional)
toc: true (default, set false only if very short)
---
```

2. **Definition block (for Key Concepts):**
```markdown
<Definition>
Clear, concise explanation of the concept (1-2 sentences)
</Definition>
```

3. **Overview section (for longer documents):**
Brief introduction explaining what the reader will learn

4. **Body sections with clear headings**

5. **Related concepts section (for Key Concepts):**
```markdown
## Related Concepts
- [Link to related topic](/path)
- [Another related topic](/path)
```

6. **Next steps section (for tutorials):**
```markdown
## Next Steps
Now that you've completed this tutorial, you can:
1. Try [related task]
2. Learn about [related concept]
```

### 5.2 Tutorial Structure

**Required sections for tutorials:**

1. **SummaryCard** with duration:
```markdown
<SummaryCard duration="30 minutes">
<SummarySection>
Brief description of what the tutorial covers
</SummarySection>
<PrerequisitesSection>
- Prerequisite 1
- Prerequisite 2
</PrerequisitesSection>
</SummaryCard>
```

2. **Introduction** explaining context

3. **Step-by-step instructions** with clear headings

4. **Examples and screenshots** showing the process

5. **Tips and warnings** using TipBox components

6. **Next steps** pointing to related tutorials

### 5.3 Section Ordering

**Standard order for Key Concepts:**
1. Definition block
2. Overview
3. How it works (technical explanation)
4. Configuration/usage instructions
5. Examples (simple to complex)
6. Best practices
7. Common patterns
8. Troubleshooting (if applicable)
9. Related concepts
10. Next steps

### 5.4 Heading Hierarchy

**Rules:**
- Only one H1 per document (the title)
- Don't skip levels (H2 → H4)
- Use descriptive headings
- Keep headings concise (under 60 characters)

**Hierarchy:**
- H1: Document title (from frontmatter)
- H2: Major sections
- H3: Subsections
- H4: Minor subsections (use sparingly)

---

## 6. Content Organization

### 6.1 Progressive Disclosure

**Resolution:** Order content from simple to complex:

1. **What** - Define the concept
2. **Why** - Explain the purpose
3. **How** - Provide instructions
4. **Examples** - Show it in action
5. **Best practices** - Offer guidance
6. **Advanced** - Cover edge cases

### 6.2 Information Density

**Guidelines:**
- **Paragraphs:** 3-5 sentences maximum
- **Sentences:** 15-25 words average (vary for rhythm)
- **Lists:** 3-7 items ideal (break up longer lists)
- **Sections:** 200-500 words before next heading

**Break up long content with:**
- Subheadings
- Lists
- TipBox components
- Examples
- Images

### 6.3 Examples and Use Cases

**Resolution:** Every major concept should include:

1. **Simple example** - Demonstrates basic usage
2. **Real-world use case** - Shows practical application
3. **Common pattern** - Reusable template

**Format for examples:**
```markdown
**Example:** [Brief description]

[Setup/context]

**Implementation:**
- Step 1
- Step 2

**Result:** [Expected outcome]
```

---

## 7. Cross-Referencing Standards

### 7.1 When to Link

**Always link:**
- First mention of a Key Concept in any document
- References to other tutorials or guides
- Interface names (to their documentation)
- Technical terms with dedicated pages

**Don't over-link:**
- Same term multiple times in same section
- Every occurrence of common terms
- External sites unless specifically relevant

### 7.2 Link Context

**Provide context for links:**
- ✅ "See the [skip logic guide](/path) for details on conditional stages"
- ✅ "Learn more about [forms](/path)"
- ✗ "See [here](/path)" - no context
- ✗ "Click [this link](/path)" - not descriptive

### 7.3 Bidirectional Linking

**Resolution:** Ensure related documents link to each other:

Example:
- Skip Logic document links to Network Filtering
- Network Filtering document links back to Skip Logic
- Both link to the Tutorial showing them in use

### 7.4 "See also" Sections

**Format:**
```markdown
## Related Concepts

- [Forms](/en/desktop/key-concepts/forms) - Build forms with input controls
- [Field Validation](/en/desktop/key-concepts/field-validation) - Ensure data quality
- [Input Controls](/en/desktop/key-concepts/input-controls) - Choose appropriate controls
```

---

## 8. Resolved Ambiguities

### 8.1 Node vs. Alter

**Resolution:**
- Use **"node"** in technical contexts and researcher documentation
- Use **"alter"** when describing the participant's perspective
- Use both interchangeably when appropriate: "Participants nominate alters, creating nodes in the network"

**Examples:**
- ✅ "Each node has attributes" (technical)
- ✅ "Participants name alters" (participant perspective)
- ✅ "The network contains 10 nodes representing the alters named" (both)

### 8.2 Edge vs. Tie

**Resolution:**
- Use **"edge"** in technical contexts (data structure, exports, technical documentation)
- Use **"tie"** or **"relationship"** in conceptual explanations
- Prefer "relationship" when speaking to researchers about social networks

**Examples:**
- ✅ "The edge list contains all relationships" (technical)
- ✅ "Create ties between alters" (conceptual)
- ✅ "The Sociogram allows participants to create relationships between network members" (accessible)

### 8.3 Interview vs. Interview Session vs. Session

**Resolution:**
- **"Interview"** - General process or concept
- **"Interview session"** - Specific instance with data
- **"Session"** - Short form after first mention of "interview session"

**Examples:**
- ✅ "The interview typically takes 30 minutes" (general)
- ✅ "Each interview session is stored separately" (specific)
- ✅ "You can resume a session from the start screen" (short form)

### 8.4 Stage vs. Screen vs. Interface

**Resolution:**
- **"Interface"** - The type/category of data collection tool
- **"Stage"** - A configured instance of an interface in a protocol
- **"Screen"** - The visual display (avoid in documentation, use "stage")

**Examples:**
- ✅ "The Name Generator interface"
- ✅ "Add a stage to your protocol"
- ✅ "Configure the stage settings"
- ✗ "Add a screen" (use "stage")

### 8.5 Protocol vs. Protocol File vs. .netcanvas file

**Resolution:**
- **"Protocol"** - The interview design (conceptual)
- **"Protocol file"** - The file containing the protocol
- **".netcanvas file"** - Specific file format reference

**Examples:**
- ✅ "Design your protocol in Architect"
- ✅ "Import the protocol file into Interviewer"
- ✅ "The `.netcanvas` file contains all protocol data"

### 8.6 App vs. Application vs. Software vs. Tool

**Resolution:**
- **"Application"** or **"app"** - For installed software (Architect, Interviewer)
- **"Tool"** - For the suite or features
- **"Software"** - Generic or suite reference

**Examples:**
- ✅ "The Interviewer application"
- ✅ "Install the app on your tablet"
- ✅ "Network Canvas tools"
- ✅ "The software suite includes three applications"

### 8.7 Roster vs. Roster Data vs. External Data

**Resolution:**
- **"Roster"** - Short form, use after first mention
- **"Roster data"** - When emphasizing it's a data file
- **"External data"** - Generic term including non-roster data

**Examples:**
- ✅ "Import roster data from a CSV file"
- ✅ "The roster contains 500 students"
- ✅ "External data can populate name generators"

### 8.8 Name Generation vs. Name Elicitation vs. Alter Nomination

**Resolution:**
- **"Name generation"** - Standard term for the process
- **"Nominating alters"** - Participant-facing description
- Avoid "elicitation" (too academic) and "nomination" in isolation

**Examples:**
- ✅ "Name generation is the first step"
- ✅ "Participants nominate alters on this stage"
- ✗ "The elicitation process" (too formal)

### 8.9 Export vs. Export Data vs. Data Export

**Resolution:**
- **"Export data"** - Verb phrase, the action
- **"Data export"** - Noun phrase, the result
- **"Export"** - Short form acceptable

**Examples:**
- ✅ "Export data from the interviews page"
- ✅ "The data export includes all sessions"
- ✅ "Configure export options"

### 8.10 Skip vs. Hide vs. Omit (for stages)

**Resolution:**
- **"Skip"** - Standard term (matches "skip logic")
- Avoid "hide" and "omit"

**Examples:**
- ✅ "Skip this stage if no nodes exist"
- ✅ "The stage was skipped"
- ✗ "Hide the stage" (use "skip")

---

## 9. Special Cases

### 9.1 Acronyms and Abbreviations

**Rule:** Define on first use, then use acronym

**Examples:**
- ✅ "Institutional Review Board (IRB)" → then "IRB"
- ✅ "Visual Analog Scale (VAS)" → then "VAS"
- ✅ "Human-Computer Interaction (HCI)" → then "HCI"

**Common acronyms that don't need definition:**
- CSV (widely known)
- URL (widely known)
- ID (widely known)
- USB (widely known)

### 9.2 Version Numbers

**Rule:** Use consistent format

**Examples:**
- ✅ "Network Canvas 6.0"
- ✅ "Version 6.0.1"
- ✅ "Schema version 8"
- ✗ "v6.0" or "ver. 6.0"

### 9.3 Operating Systems

**Rule:** Use full names on first mention

**Examples:**
- ✅ "Windows, macOS, and Linux"
- ✅ "iOS and Android"
- ✗ "Mac" (use "macOS")
- ✗ "OSX" (outdated, use "macOS")

### 9.4 File Paths

**Rule:** Use forward slashes, code formatting

**Examples:**
- ✅ `/docs/desktop/key-concepts/`
- ✅ `C:\Users\Name\Documents\` (Windows paths use backslashes)
- ✅ The `.netcanvas` file is located in `/protocols/`

### 9.5 Numbers

**Rule:**
- Spell out zero through nine
- Use numerals for 10 and above
- Use numerals for technical values, measurements, versions

**Examples:**
- ✅ "Three stages"
- ✅ "15 participants"
- ✅ "A 5-point Likert scale"
- ✅ "Version 6.0"
- ✗ "Fifteen participants" (use numerals)

---

## 10. Component Usage

### 10.1 TipBox

**Use for:**
- Important notes
- Warnings
- Pro tips
- Reminders

**Syntax:**
```markdown
<TipBox>
Regular tip or note
</TipBox>

<TipBox danger>
Warning or caution
</TipBox>
```

**Guidelines:**
- Keep to 2-3 sentences
- One main point per tip
- Use sparingly (no more than 2-3 per page)

### 10.2 KeyConcept

**Use for:**
- Defining key concepts mid-tutorial
- Highlighting important principles
- Providing context

**Syntax:**
```markdown
<KeyConcept title="Title Here">
Explanation of the key concept
</KeyConcept>
```

### 10.3 Definition

**Use for:**
- Opening definition in Key Concepts articles
- One per article, at the top

**Syntax:**
```markdown
<Definition>
Clear, concise definition (1-2 sentences)
</Definition>
```

---

## 11. Quality Checklist

Before submitting documentation, verify:

- [ ] Terminology is consistent (product names capitalized, technical terms lowercase)
- [ ] Active voice used where appropriate
- [ ] Second person ("you") used for instructions
- [ ] All acronyms defined on first use
- [ ] Internal links use relative paths
- [ ] Images have descriptive alt text
- [ ] No broken links
- [ ] Headers use sentence case
- [ ] Paragraphs are 3-5 sentences max
- [ ] UI elements are bolded
- [ ] Code/filenames use backticks
- [ ] Related concepts section included
- [ ] Prerequisites listed (for tutorials)
- [ ] Examples provided for complex concepts
- [ ] No "simply," "just," or "obviously"
- [ ] Contractions used sparingly
- [ ] Professional but approachable tone

---

## 12. Revision History

| Date | Change | Author |
|------|--------|--------|
| 2025-11-18 | Initial resolutions document created | Claude |

---

## 13. Authority and Updates

**This document establishes official standards for Network Canvas documentation.**

**When to update:**
- New terminology needs standardization
- Ambiguities are discovered
- Team decisions change preferences
- User feedback suggests improvements

**Update process:**
1. Propose change in documentation review
2. Document decision in this file
3. Apply consistently across all documentation
4. Update revision history

---

*These resolutions should be referenced for all documentation work to ensure consistency across the Network Canvas documentation suite.*
