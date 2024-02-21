---

title: Project Testing Strategy
last_modified_at: 2019-10-02

---

This document describes our approach to testing the software stack. It is intended for developers, or technically oriented users who wish to contribute code to the project.

## Current Approach

Currently projects use a mixture of enzyme snapshot tests and unit/integration tests. There is an integration (or end to end) test suite. which ensures the apps (electron only) are compatible with one another: [https://github.com/codaco/integration-tests](https://github.com/codaco/integration-tests).

A protocol validation schema allows testing of protocol files in the live apps, but itself is relevant to testing in that it can be used to ensure the apps can produce/consume valid interviews.

Appium was trialed for similar integration testing for mobile, but the approach proved slow, brittle and prone to false positives.

## Review

Large software outfits such Google promote a unit testing focused approach, with only a minor role played by E2E (end to end) testing. Reasons given include:

*   Overarching issues, such as a 'login', can cause the entire suite to fail, when this isn't fixed immediately, many smaller bugs can be hidden,
*   E2E testing is slow, in the case of larger software suits, developers may have to wait until the next day to see results.


### Levels of testing

**End to end**
Test the finished product (e.g., simulating running the application as a user)

**Integration:**
Test composite components and/or the interaction of components, a middle ground between the two.

**Unit:**
Test individual functions and classes

Unit testing is favored because:

*   It can provide immediate feedback
*   It is specific (can aid finding bugs)


### Rationale

In the case of the Network Canvas project, there are two overarching needs for testing:

*   Acceptance testing: do the apps work as intended?
*   Documentation and ease of development: on boarding new contributors, bug fixing and documenting the intent of code.

Because of these needs (acceptance testing) it may be that end to end testing should play a more central role in testing, despite the drawbacks.

Current end to end tests are scarce, and non-spotted regressions can easily make it into releases. Whilst this is mitigated somewhat with manual tests, it would be preferable to automate longer term.

There are enzyme snapshot tests for the UI, but aren't providing any value. When they fail, it isn't indicative of an actual issue and only a reflection of changes to the UI. They should be removed/discontinued, and replaced with E2E tests that simulate actual usage.

The unit and integration tests are somewhat useful, especially when related to functional oriented code, such as format conversion. Some integration tests can be brittle when functionality is revised, but as the software matures, that will be less of an issue.


## Summary of Strategy

*   Test what is important to the user
    *   E2E coverage should start 10,000ft and narrow down as needed
    *   Test behavior, not implementation
        *   Architect: UI changes -> creates a protocol which is valid
*   Tests should be as simple as possible to run
    *   Automated
    *   Cohabit with code
    *   Provide fast feedback loop
    *   Runnable on CI (ideal)
*   Tests that aid future development
    *   Document intended functionality within tests to make intended input and output clear.
    *   Shared mock state where considered canonical
    *   Help to find bugs


## Implementation of Strategy

*   Write end to end tests to document app usage. These will be used to validate that the application is fit for release. They should test UI interactions match expected outcomes, some examples:
    *   Network Canvas: When a user enters some text, the network should be modified as expected.
    *   Architect: When a user clicks a button, the protocol should be modified as expected.
    *   Server: When a user does X in the interface, then Y should happen to the network/protocol object.
    *   Build a list of "core outcomes" (such as the above) that can be implemented immediately. Base this off of the manual checklist.
*   Write unit tests to document underlying infrastructure. These will be used to find bugs and ensure that utility functions work as expected. Core functionality such as saving and loading files is a good example requiring unit tests.
    *   When `saveProtocol()` is called, the protocol should write to the disk (or call APIs that do).
    *   When a network is converted to XML, the generated data is as expected.
*   Write unit and/or end to end tests to validate bug fixes. If you find yourself writing lots of log statements, this might be a good place to add a test.


## General guidance

*   Test to an interface, for example on a React component you might check which prop functions (output) are called when a button is clicked (input).
    *   Try to avoid testing implementation details. For example:
        *   If you are testing a composite component and need to specify component names. Instead use 
        *   If you need access to class variable names or functions to run the tests
*   When underlying code changes, making tests outdated ensure old tests are replaced to maintain code coverage.
*   Create (modular) factory generators for canonical mocks. Suggest using [Rosie](https://github.com/rosiejs/rosie). Shared mock state should be used wherever possible, and established where it doesn't currently exist.
*   The existing integration tests are still very relevant, but it would be good to be able to run them as part of each app. The integration-tests repo could them be adapted to run these suites together if desired. For example: Architect can be tested to produce a validated protocol, and network canvas can be tested to run a validated protocol as a separate step


## Guidance for Reviewers

**TBC: **To enable the above strategy to be consistently implemented, we will develop a checklist for reviewers to help them when conducting a formal code review on a feature or bugfix PR. This will also help external collaborators, and could be included as part of a PR template.

## How to test

Ideally tests should be written either before implementation or in parallel with implementation.

Tests are written on top of Jest, which is part of the React project. Enzyme can be used to simulate small parts of UI, but this is not a reliable way to test UI, and should be treated as unit/integration type test. Spectron can be used to drive end to end tests.


### Bug fixes

1. Write a functional or unit test to match the issue described. At this point the test should fail.
2. Implement the fix by making necessary until the test passes.
3. If you find yourself writing lots of logging statements to debug the problem, consider writing unit tests to cover those steps if it seems prudent to do so.

### New features

Whilst ideally this should cover the same steps as a bug fix, it may be that some experimentation is required until a fully testable implementation is made. In this case, it may still be possible to loosely write high level test stubs which can then be populated as the implementation materializes.



1. Write a high level functional/unit test stubs that describe the feature.
2. Implement the feature and the tests side by side, with precedence to the tests, where possible.
3. If you find yourself writing lots of logging statements to debug the problem, consider writing unit tests to cover those steps if it seems prudent to do so.

### Backfilling missing tests when developing new features/fixes

If you are implementing a bug fix or feature for a part of the app with no coverage, follow the principle of "leave it better than you found it", e.g., if you add functionality to the sociogram interface, create a test harness for the whole interface, and stub (and/or implement) any tests that need to be implemented yet for that interface.

## Metrics

Jest provides a code coverage feature which covers execution of branches, functions, lines and statements. Whilst useful for directing missing test coverage, it doesn't exactly match what should be considered 'good' coverage. The aim should be for this report to get better over time, and if that isn't the case review why figures are declining.

For Spectron tests, aim for every part of UI to be tested (e.g., every clickable, draggable thing). Coverage is difficult to measure automatically so will need to be part of code review.


## Feedback

*   screenshot / visual snapshot testing? Can jest do this already, how do we get feedback of diff
*   Track test coverage in CI. How?
*   Develop checklist for reviewers and for PRs
*   Can we simulate other environments too? Snapshots on third party tool?
*   metrics : contribution guide, or for reviewers.
*   React testing?
*   ensure unit tests for reducers cover all action types
