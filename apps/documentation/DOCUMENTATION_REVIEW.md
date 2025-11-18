# Network Canvas Documentation Review
**Technical Editorial Review**
**Date:** November 18, 2025
**Reviewer:** Claude (Technical Editor)

## Executive Summary

This comprehensive review examines the Network Canvas documentation for clarity, consistency, writing style, and completeness. The documentation is generally well-structured and thorough, but there are opportunities for improvement in terminology consistency, organization, and coverage of certain topics.

**Overall Assessment:** Good foundation with room for targeted improvements
**Priority Areas:** Terminology standardization, missing documentation, cross-referencing

---

## 1. Terminology Consistency Issues

### 1.1 Capitalization Inconsistencies

**Issue:** Inconsistent capitalization of key terms throughout the documentation.

**Findings:**
- "Interviewer" vs "interviewer" vs "the Interviewer app" vs "Network Canvas Interviewer"
- "Architect" vs "architect"
- "Protocol" vs "protocol"
- "Interface" vs "interface"
- "Stage" vs "stage"
- "Fresco" appears consistently capitalized (good)

**Recommendation:** Establish clear style guide rules:
- Product names (proper nouns): Always capitalize → "Interviewer", "Architect", "Fresco"
- Generic references: Lowercase → "the protocol", "an interface", "a stage"
- Example: "Open Architect to create a protocol" ✓
- Example: "The architect software" ✗

**Files affected:** All tutorial and guide files

### 1.2 Term Variation

**Issue:** Multiple terms used for the same concept without clear differentiation.

| Concept | Variations Found | Recommended Standard |
|---------|------------------|---------------------|
| Network Canvas suite | "Network Canvas tools", "Network Canvas software", "the software", "the apps" | "Network Canvas software suite" or "Network Canvas tools" |
| Interview session | "interview", "session", "interview session" | "interview session" (technical), "interview" (general) |
| Participant URL | "participation URL", "unique URL", "participant URL" | "participant URL" (for unique), "recruitment URL" (for anonymous) |
| Node creation | "nominating alters", "creating nodes", "adding nodes", "generating names" | Use context-appropriate: "name generation" (process), "creating nodes" (technical), "nominating alters" (participant-facing) |

### 1.3 Technical vs. User-Facing Language

**Issue:** Inconsistent voice between researcher-facing and participant-facing terminology.

**Example from `using-interviewer.en.mdx`:**
> "Each Interface is designed for a specific task within a network interview."

Better: "Each Interface is designed to collect specific types of network data."

**Recommendation:**
- Researcher documentation: Technical precision is appropriate
- Tutorial documentation: Balance technical accuracy with accessibility
- Always define technical terms on first use

---

## 2. Writing Style Issues

### 2.1 Verbose Constructions

**Issue:** Some passages use unnecessarily complex sentence structures.

**Example from `configuring-devices.en.mdx` (line 7):**
> "Different hardware, as well as the specific needs of your research population - as well as the needs of an individual participant - all impact the way you should configure Interviewer in order to create the ideal environment."

**Improved:**
> "Configure Interviewer to suit your hardware, research population, and individual participant needs to create the ideal interview environment."

**Example from `building-a-protocol.en.mdx` (line 56):**
> "The panel at the top is the protocol card that you will see when you import this protocol into Interviewer. It shows the protocol name and description, and has three buttons for downloading the printable codebook, accessing the protocol's resource library and managing the codebook."

**Improved:**
> "The protocol card displays the protocol name and description, and provides three buttons: download printable codebook, access resource library, and manage codebook. This card appears when you import the protocol into Interviewer."

### 2.2 Passive Voice Overuse

**Issue:** Excessive passive voice reduces clarity and engagement.

**Examples:**
- "The codebook can be visualized in the codebook view" → "View the codebook in the codebook view"
- "Skip logic is configured by creating one or more rules" → "Create one or more rules to configure skip logic"
- "Protocols are designed in Architect" → "Design protocols in Architect"

### 2.3 Inconsistent Tone

**Issue:** Shifts between formal academic tone and conversational tone within documents.

**Example from `project-overview.en.mdx`:**
- Formal: "Underpinning each of the three pieces of software are a set of five design principles"
- Conversational: "The `.netcanvas` file contains all of the data in your protocol. So if you use roster data, images, or video, these will be embedded within the file."

**Recommendation:** Adopt a consistently professional but approachable tone throughout.

---

## 3. Structural and Organizational Issues

### 3.1 Missing Prerequisites Sections

**Issue:** Not all tutorials include prerequisite information.

**Files with good prerequisite sections:**
- ✓ `building-a-protocol.en.mdx`
- ✓ `using-interviewer.en.mdx`
- ✓ `working-with-data.en.mdx`

**Files missing prerequisites:**
- `configuring-devices.en.mdx` - Should specify: "Before beginning, ensure you have installed Interviewer on your devices"

### 3.2 Redundant Content

**Issue:** File type and export options documentation is duplicated across multiple files.

**Duplicated sections:**
1. `using-interviewer.en.mdx` (lines 406-420)
2. `protocol-and-data-workflows.en.mdx` (lines 136-159)
3. `using-fresco.en.mdx` (lines 264-281)

**Recommendation:**
- Create a shared "Data Export" guide in Key Concepts
- Reference it from tutorials with: "For export options, see [Data Export Guide](/en/desktop/key-concepts/data-export)"
- Keep only workflow-specific details in each tutorial

### 3.3 Inadequate Cross-Referencing

**Issue:** Related concepts are not always cross-referenced effectively.

**Examples of missing links:**
- `forms.en.mdx` mentions input controls and validation but doesn't link to those concept pages
- `skip-logic.en.mdx` references network filtering but doesn't link to that documentation
- `building-a-protocol.en.mdx` mentions resources but links to a dead internal anchor

**Recommendation:** Conduct a linking audit and add cross-references systematically.

---

## 4. Clarity and Comprehension Issues

### 4.1 Unexplained Acronyms and Abbreviations

**Issue:** Some abbreviations used without definition.

- "IRB" (line 82, `protocol-and-data-workflows.en.mdx`) - Used without definition
  - Add: "Institutional Review Board (IRB)"
- "HCI" (line 74, `project-overview.en.mdx`) - Used without definition
  - Add: "Human-Computer Interaction (HCI)"

### 4.2 Ambiguous Instructions

**Example from `using-fresco.en.mdx` (line 76):**
> "Participant identifiers are used by Fresco to onboard participants. They might be exposed to the participant during this process via the participation URL, and so must not contain any sensitive information, and must not be easy to guess (e.g. sequential numbers, or easily guessable strings)."

**Issue:** "Might be exposed" is vague.

**Improved:**
> "Participant identifiers appear in participation URLs and are visible to participants. Never use sensitive information or predictable patterns (such as sequential numbers: 001, 002, 003) as identifiers."

### 4.3 Missing Context

**Example from `codebook.en.mdx`:**
The document describes the codebook view but doesn't explain WHY the codebook is important or HOW it helps researchers.

**Suggested addition:**
> "The codebook provides a centralized overview of your data structure, helping you ensure consistency across your protocol and making it easier to plan your data analysis."

---

## 5. Missing Documentation

### 5.1 Critical Missing Guides

#### 5.1.1 Input Controls Guide
**Status:** Referenced but not found
**Path needed:** `/en/desktop/key-concepts/input-controls.en.mdx`
**Content needed:**
- Comprehensive list of all input control types
- When to use each type
- Examples and best practices
- Visual examples of each control

**Referenced in:**
- `building-a-protocol.en.mdx` (line 320)
- `forms.en.mdx` (line 29)

#### 5.1.2 Field Validation Guide
**Status:** Referenced but not found
**Path needed:** `/en/desktop/key-concepts/field-validation.en.mdx`
**Content needed:**
- Types of validation rules available
- How to configure validation
- Common validation patterns
- Error messages and user experience

**Referenced in:**
- `forms.en.mdx` (line 40)

#### 5.1.3 Network Filtering Guide
**Status:** Referenced but not found
**Path needed:** `/en/desktop/key-concepts/network-filtering.en.mdx`
**Content needed:**
- What network filtering is
- How it differs from skip logic
- Configuration examples
- Use cases and best practices

**Referenced in:**
- `using-interviewer.en.mdx` (line 357)
- Multiple other files

#### 5.1.4 Data Export Guide
**Status:** Missing comprehensive guide
**Path needed:** `/en/desktop/key-concepts/data-export.en.mdx`
**Content needed:**
- Detailed explanation of CSV vs GraphML
- Export options explained in detail
- Data structure and format specification
- Examples of exported data
- Import into analysis tools (R, SPSS, etc.)

### 5.2 Incomplete Topics

#### 5.2.1 Resources/Assets Documentation
**Status:** Mentioned frequently but no comprehensive guide
**Path:** `/en/desktop/key-concepts/resources.en.mdx` exists but incomplete
**Gaps:**
- How to organize resources effectively
- File size limits and optimization
- Supported file formats for each media type
- Best practices for resource management

#### 5.2.2 Protocol Versioning and Migration
**Status:** Not documented
**Needed content:**
- How to version protocols
- When to create a new protocol vs. updating existing
- Protocol schema version implications
- Migrating participants to new protocol versions

#### 5.2.3 Troubleshooting Guide
**Status:** Missing for Desktop suite
**Path needed:** `/en/desktop/troubleshooting/common-issues.en.mdx`
**Content needed:**
- Common error messages and solutions
- Performance optimization tips
- Protocol debugging strategies
- Data export troubleshooting

### 5.3 Advanced Topics Gaps

#### 5.3.1 Custom Node Labeling
**Status:** Mentioned in Fresco limitations but not fully documented
**Referenced in:** `about.en.mdx` (line 96)
**Path needed:** `/en/desktop/advanced-topics/node-labelling.en.mdx`

**Note:** This file may exist but wasn't in my sample - verify and review if present.

#### 5.3.2 Protocol Schema Information
**Status:** File exists but marked for review
**Path:** `/en/desktop/advanced-topics/protocol-schema-information.en.mdx`
**Review needed:** Ensure technical accuracy and accessibility

### 5.4 Fresco-Specific Gaps

#### 5.4.1 Security and Privacy Best Practices
**Status:** Mentioned but not detailed
**Path needed:** `/en/fresco/security-privacy.en.mdx`
**Content needed:**
- Data security implications of web deployment
- GDPR/HIPAA compliance considerations
- Encryption and data protection
- Access control best practices

#### 5.4.2 Performance and Scaling
**Status:** Not documented
**Path needed:** `/en/fresco/deployment/performance.en.mdx`
**Content needed:**
- Expected performance characteristics
- Scaling considerations
- Resource requirements for different study sizes
- Optimization strategies

---

## 6. Positive Observations

### 6.1 Strengths
- ✓ Excellent use of visual aids (screenshots, diagrams)
- ✓ Consistent use of custom MDX components (TipBox, KeyConcept, etc.)
- ✓ Good progressive disclosure (basic → advanced topics)
- ✓ Comprehensive tutorial coverage for basic workflows
- ✓ Good use of examples throughout

### 6.2 Well-Documented Areas
- Name generator configuration
- Form creation
- Basic Interviewer workflow
- Fresco deployment basics
- R data analysis integration

---

## 7. Priority Recommendations

### High Priority (Immediate Action)
1. **Create missing referenced documentation** (Input Controls, Field Validation, Network Filtering)
2. **Standardize terminology** using style guide
3. **Create Data Export comprehensive guide** to eliminate duplication
4. **Fix broken internal links** and add cross-references

### Medium Priority (Next Quarter)
5. **Add troubleshooting documentation**
6. **Create protocol versioning guide**
7. **Expand Resources documentation**
8. **Standardize prerequisites sections**
9. **Reduce passive voice** in key tutorials
10. **Add security/privacy guide** for Fresco

### Low Priority (Ongoing)
11. Simplify verbose constructions
12. Enhance visual consistency
13. Add more code examples where applicable
14. Create video tutorials for complex topics

---

## 8. Style Guide Recommendations

### 8.1 Proposed Terminology Standards

| Term | Usage | Example |
|------|-------|---------|
| Architect | Product name (capitalized) | "Open Architect to design your protocol" |
| Interviewer | Product name (capitalized) | "Install Interviewer on your tablet" |
| Fresco | Product name (capitalized) | "Deploy Fresco to your server" |
| protocol | Generic (lowercase) | "The protocol contains five stages" |
| interface | Generic (lowercase) unless specific type | "Add a Name Generator interface" |
| stage | Generic (lowercase) | "Configure the next stage" |
| node/alter | Interchangeable, context-dependent | "Participants create nodes by nominating alters" |
| edge/tie | Use "edge" for technical, "tie" for conceptual | "The edge represents a relationship between two alters" |

### 8.2 Voice and Tone
- **Active voice preferred:** "Configure the stage" not "The stage is configured"
- **Direct address:** "You can create" not "One can create" or "Researchers can create"
- **Professional but approachable:** Avoid overly academic language
- **Concise:** Prefer shorter sentences; break up complex thoughts

### 8.3 Formatting Standards
- **Bold** for UI elements: "Click the **Add New Stage** button"
- *Italic* for emphasis: "Protocols must be created *before* deployment"
- `Code` for filenames and technical terms: "The `.netcanvas` file"
- > Quotes for participant-visible text

---

## 9. Missing Documentation: Detailed Specifications

### 9.1 Input Controls Guide

**Filename:** `input-controls.en.mdx`
**Location:** `/apps/documentation/docs/desktop/key-concepts/`
**navOrder:** Between `forms` and `field-validation`

**Proposed structure:**
```markdown
---
title: Input Controls
---

<Definition>
Input controls determine how participants enter data for variables in Network Canvas.
</Definition>

## Overview
[Explain what input controls are and how they relate to variable types]

## Available Input Controls

### Text-Based Controls
#### Text Input
- **Variable type:** Text (string)
- **Use when:** Collecting short text responses (names, single words)
- **Configuration options:** Character limits, placeholder text
- **Example:** Collecting alter names

#### Text Area
- **Variable type:** Text (string)
- **Use when:** Collecting longer text responses (descriptions, narratives)
- **Configuration options:** Character limits, rows
- **Example:** "Describe your relationship with this person"

### Numerical Controls
#### Number Input
[Details...]

### Categorical Controls
#### Radio Button Group
#### Checkbox Group
#### Toggle
#### Toggle Button Group
[Details for each...]

### Specialized Controls
#### Date Picker
#### Likert Scale
#### Visual Analog Scale
[Details for each...]

## Choosing the Right Input Control
[Decision tree or guidelines]

## Best Practices
[Recommendations for UX and data quality]
```

### 9.2 Field Validation Guide

**Filename:** `field-validation.en.mdx`
**Location:** `/apps/documentation/docs/desktop/key-concepts/`

**Proposed structure:**
```markdown
---
title: Field Validation
---

<Definition>
Validation rules ensure participants provide valid and complete data.
</Definition>

## Types of Validation

### Required Fields
### Format Validation
### Range Validation
### Custom Validation Logic

## Validation by Variable Type
[Type-specific validation options]

## Error Messages and User Experience
[How validation appears to participants]

## Best Practices
[When to use validation, when not to]
```

### 9.3 Network Filtering Guide

**Filename:** `network-filtering.en.mdx`
**Location:** `/apps/documentation/docs/desktop/key-concepts/`

**Proposed structure:**
```markdown
---
title: Network Filtering
---

<Definition>
Network filtering controls which nodes or edges are visible on specific stages.
</Definition>

## Network Filtering vs. Skip Logic
[Clear distinction between these related concepts]

## How Network Filtering Works
[Technical explanation]

## Configuring Filters
[Step-by-step guide]

## Common Use Cases
### Filtering by Node Type
### Filtering by Attributes
### Complex Filter Combinations

## Examples
[Real-world scenarios]
```

---

## 10. Implementation Checklist

### Phase 1: Critical Fixes (Week 1-2)
- [ ] Create `input-controls.en.mdx`
- [ ] Create `field-validation.en.mdx`
- [ ] Create `network-filtering.en.mdx`
- [ ] Create `data-export.en.mdx`
- [ ] Update all references to these new guides
- [ ] Fix broken internal links

### Phase 2: Consistency (Week 3-4)
- [ ] Apply terminology standardization across all files
- [ ] Remove duplicated export documentation, replace with references
- [ ] Add prerequisites sections where missing
- [ ] Standardize formatting (bold for UI, code for files, etc.)

### Phase 3: Enhancement (Week 5-8)
- [ ] Create troubleshooting guide
- [ ] Expand Resources documentation
- [ ] Create protocol versioning guide
- [ ] Add security/privacy guide for Fresco
- [ ] Reduce passive voice in tutorials
- [ ] Enhance cross-referencing

### Phase 4: Maintenance (Ongoing)
- [ ] Regular link checking
- [ ] Update screenshots as UI changes
- [ ] Collect user feedback on clarity
- [ ] Monitor which pages need more examples

---

## 11. Metrics for Success

Track these metrics to measure documentation improvement:

1. **Completeness:** Number of broken links reduced to zero
2. **Consistency:** Automated terminology checker passes 95%+
3. **User satisfaction:** Support forum questions about topics covered in docs decrease by 30%
4. **Coverage:** All referenced documentation exists and is accessible

---

## Conclusion

The Network Canvas documentation is comprehensive and well-structured, serving as a solid foundation for users. The primary areas for improvement are:

1. **Terminology consistency** - Establish and apply clear standards
2. **Missing critical guides** - Create referenced but nonexistent documentation
3. **Content duplication** - Consolidate repeated sections
4. **Cross-referencing** - Improve navigation between related topics

Implementing the recommendations in this review will significantly enhance documentation usability and reduce user confusion, particularly for new researchers adopting the Network Canvas tools.

---

**Next Steps:**
1. Review and approve recommendations
2. Prioritize implementation phases
3. Assign creation of missing documentation
4. Establish style guide for contributors
5. Set up documentation quality checks

