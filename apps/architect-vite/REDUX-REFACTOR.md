# Development Plan for Refactoring Redux Store and Dialog System

FOR ALL PHASES:

- Check with the user when important decisions are made. Log these decisions for future reference.
- Do not attempt to run the dev server, or to lint or typecheck unless instructed.
- Refer back to this document regularly to ensure that the plan is being followed.

## Phase 1

Overall aim: Refactor the Redux store to better represent the current protocol being edited or viewed, and implement a new route for viewing protocols.

Changes to the Redux store:

- 'recentProtocols' should be renamed to 'protocols', and should conceptually serve as a datastore of all protocols that have been opened or created in the app.
- 'protocols' should be renamed to reflect the fact that it will represent the current protocol being edited or viewed. It will be populated based on the route (see navigation changes below).

Changes to navigation:

- /protocol/{protocolId} should be implemented, which should load and display the protocol from the redux store with the corresponding protocolId.

Implementation plan:

- Create a detailed and complete plan for the refactor, which will be approved by the user.
- The plan should be written to a file that can be referenced later.
- The plan should include concrete steps, and should be broken down into smaller tasks that can be completed in a reasonable time frame.
- The plan should include new tests where appropriate, written using vitest.
- The plan should include updating all existing components, and removing any that are no longer needed.
- Progress should be tracked in a way that allows the task to be resumed later if interrupted.

## Phase 2

Overall aim: Continue refactoring to allow for more "browser native" navigation and user interaction, adding new routes for stage editing, asset management, codebook management, and protocol summary. This will involve the removal of the current extensive use of modals and overlays, and the introduction of a more structured routing system.

Changes to navigation:

- /protocol/{protocolId}/{stageId} should be implemented, which should load and display the stage editor with the corresponding stageId from the redux store.
- /protocol/{protocolId}/assets should be implemented, which should load and display the asset management interface.
- /protocol/{protocolId}/codebook should be implemented, which should load and display the codebook management interface.
- /protocol/{protocolId}/summary should be implemented, which should load and display the protocol summary interface.
- /protocol/{protocolId}/{stageId}/prompts should be implemented, which should load and display the prompt editor interface for the specified stageId.
- Other uses of sub-sections that currently render modals/overlays/screens should be identified, and new routes should be created for them as needed.

Changes to components:

- Refactor the StageEditor component to be a full page view, rather than a modal.
- Take the opportunity to reorganize and refactor related components for better maintainability and usability, including implementing practices from CLAUDE.md.
- Follow this same pattern to update the components used in the asset management, codebook management, and protocol summary routes.

Implementation plan:

- Create a detailed and complete plan for the refactor, which will be approved by the user.
- The plan should be written to a file that can be referenced later. Where actions involve modifying existing files, the plan should include a list of files that will be modified, and track if they have been processed.
- The plan should include concrete steps, and should be broken down into smaller tasks that can be completed in a reasonable time frame.
- The plan should include new tests where appropriate, written using vitest.
- The plan should include updating all existing components, and removing any that are no longer needed.
- Progress should be tracked in a way that allows the task to be resumed later if interrupted.

## Phase 3

- OVERALL AIM: Remove the screen and stack concepts from the app entirely, including ALL components and redux store state, actions, selectors etc. Also remove any associated scss styles.
- Implementation should consist of first analysing the codebase, and thinking deeply to create a detailed plan, which will be approved by the user.
- The plan should include detailed concrete steps, including lists of files that must be changed, and should be broken down into smaller tasks where required.
- This plan should be written to a file that can be referenced later.

Changes to components:

- Remove the concept of "screens" from the app. Remove the core components that Screens and Stacks are built with.
- Update any components that currently render inside these screens, to no longer use them.
- Remove all uses of the old screen and stack components, including any components that were specifically designed to work with them.
- Ensure that all components that previously relied on the screen and stack system are updated. If unsure how functionality should be implemented, consult with the user.

Changes to the redux store:

- Remove the concept of screens and stacks from the redux store.
- Remove all uses of actions/selectors that are related to this.

## Phase 4

- OVERALL AIM: replace the dialog system with a new system based on zustand, which does not use the Redux store.
- This new system must support all existing functionality, including the ability to attach callbacks to dialog cancel/confirm actions.
- Implementation should consist of first searching the codebase creating a detailed plan, which will be approved by the user, and should be written to a file that can be referenced later. It should include concrete steps, and should be broken down into smaller tasks.
- The plan should include new tests written using vitest.
- It should include updating ALL existing components, and removing any that are no longer needed.

Changes to components:

- Create a new dialog system using zustand, including a store, actions, and selectors as needed.
- Ensure that the new dialog system supports all existing functionality, including callbacks for cancel/confirm actions.
- Create a list of all components that currently use the old dialog system. Search for all wants that a dialog might be triggered.
- Update all components that currently use the old dialog system to use the new zustand-based dialog system.
- Remove all uses of the old dialog system, including any components that were specifically designed to work with it.
- Remove all uses of the old screen and stack components, including any components that were specifically designed to work with them.
- Ensure that all components that previously relied on the screen and stack system are updated to work with the new routing system.
- Ensure that all components that previously relied on the dialog system are updated to work with the new zustand-based dialog system.
- Ensure that all components that previously relied on the redux store for screens and stacks are updated to no longer use them.

Changes to the redux store:

- Remove the concept of screens and stacks from the redux store.
- Remove all uses of actions/selectors that are related to this.
- Remove the concept of dialogs from the redux store.
- Remove all uses of actions/selectors that are related to this.
