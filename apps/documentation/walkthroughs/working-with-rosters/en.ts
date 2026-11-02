import type { Visual, Walkthrough } from '~/components/walkthrough/types';

// A recording from capture.ts, at the viewport it records.
const capture = (name: string, alt: string): Visual => ({
  kind: 'capture',
  src: `/assets/walkthroughs/working-with-rosters/${name}`,
  url: 'architect.networkcanvas.com',
  width: 1280,
  height: 736,
  alt,
});

const EXAMPLE_PROTOCOL =
  '/protocols/Roster%20Example%20Protocol%20v1.netcanvas';

const walkthrough: Walkthrough = {
  id: 'working-with-rosters',
  title: 'Working with rosters',
  description:
    'Follow along step by step while you add a roster to your protocol, from preparing the file to trying it in Preview. It remembers where you are.',
  chapters: [
    {
      id: 'start',
      tint: 'serpent',
      title: 'Before you start',
      guide: '#what-is-a-roster',
      beats: [
        {
          id: '1.1',
          type: 'explain',
          text: 'A roster is a list of people that everyone in your study sees. Participants drag names from it into their interview.',
          visual: { kind: 'scene', scene: 'roster-drag' },
        },
        {
          id: '1.2',
          type: 'choose',
          choice: 'app',
          text: 'Which Architect are you using?',
          options: [
            { id: 'browser', label: 'In my browser' },
            { id: 'classic', label: 'Architect Classic' },
          ],
          visual: { kind: 'scene', scene: 'architect-versions' },
        },
        {
          id: '1.F',
          type: 'finish',
          when: { app: 'classic' },
          text: "This walkthrough covers Architect in your browser. The guide's **Architect Classic** tab has the steps for your version.",
          guide: '#adding-the-roster-to-a-network-canvas-interview',
          visual: { kind: 'scene', scene: 'classic-tab' },
        },
      ],
    },
    {
      id: 'prepare',
      tint: 'green',
      title: 'Prepare your roster file',
      guide: '#how-to-create-a-roster',
      beats: [
        {
          id: '1.3',
          type: 'choose',
          choice: 'file',
          text: 'Which roster will you use? You can try the example first and swap in your own later.',
          options: [
            { id: 'own', label: 'My own list' },
            { id: 'example', label: 'The example roster' },
          ],
          visual: { kind: 'scene', scene: 'roster-files' },
        },
        {
          id: '2.0',
          type: 'do',
          when: { file: 'example' },
          text: 'Download the [example roster](/assets/simpsons-roster.csv). It lists five people with their occupation and gender.',
          confirm: "I've downloaded it",
          visual: { kind: 'scene', scene: 'roster-download' },
        },
        {
          id: '2.1',
          type: 'do',
          when: { file: 'own' },
          text: 'Open your list in a spreadsheet program. Put one person per row, with column headings in the first row. Extra columns are kept with each person.',
          confirm: "It's laid out",
          visual: { kind: 'scene', scene: 'sheet-layout' },
        },
        {
          id: '2.2',
          type: 'do',
          when: { file: 'own' },
          text: "Make the first column's heading **name**. It's what participants see on each person.",
          confirm: 'The first column is name',
          guide: '#considerations-for-formatting-the-csv-file',
          visual: { kind: 'scene', scene: 'sheet-name' },
        },
        {
          id: '2.3',
          type: 'do',
          when: { file: 'own' },
          text: 'Make every name different. Two people called "Kwame" look identical once added — use "Kwame K." and "Kwame N."',
          confirm: 'Every name is different',
          guide: '#collision-type-1-collisions-within-the-roster-list-itself',
          visual: { kind: 'scene', scene: 'sheet-unique' },
        },
        {
          id: '2.4',
          type: 'do',
          when: { file: 'own' },
          text: 'Save it as **CSV**, a plain file of comma-separated values, from your spreadsheet program — not a text editor.',
          confirm: "I've saved the CSV",
          visual: { kind: 'scene', scene: 'sheet-csv' },
        },
        {
          id: '2.5',
          type: 'checkpoint',
          when: { file: 'own' },
          text: 'Your file ends in **.csv**, its first heading is **name**, and no two names match.',
          confirm: 'Looks right',
          guide: '#if-architect-refuses-your-roster',
          visual: { kind: 'scene', scene: 'sheet-check' },
        },
      ],
    },
    {
      id: 'stage',
      tint: 'blue',
      title: 'Add a roster stage',
      guide: '#selecting-the-name-generator-interface',
      beats: [
        {
          id: '3.1',
          type: 'do',
          text: 'In Architect, open your protocol and click **Add new stage**.',
          confirm: "It's open",
          visual: capture(
            'roster-add-stage',
            'The protocol timeline. The cursor clicks Add new stage, and Select an Interface Type opens.',
          ),
        },
        {
          id: '3.2',
          type: 'do',
          text: 'Click **Name Generator for Roster Data**.',
          confirm: 'The stage editor is open',
          visual: capture(
            'roster-pick-interface',
            '"roster" is typed into the search box, and the Name Generator for Roster Data card is clicked.',
          ),
        },
        {
          id: '3.3',
          type: 'do',
          text: 'Click the stage name at the top, **Roster Name Generator**, and rename it something you\'ll recognize, such as "Classmates".',
          confirm: "I've named it",
          visual: capture(
            'roster-stage-name',
            'The stage name at the top of the editor is clicked and renamed Classmates.',
          ),
        },
        {
          id: '3.4',
          type: 'do',
          text: 'Under **Node type**, pick the type these people are, or click **Create new node type**, name it "Person", and click **Save entity**.',
          confirm: "I've picked a type",
          visual: capture(
            'roster-node-type',
            'Create new node type is clicked, the type is named Person and saved, and Person is selected.',
          ),
        },
        {
          id: '3.5',
          type: 'do',
          text: 'Under **Roster source**, click **Select a data file**.',
          confirm: "It's open",
          visual: capture(
            'roster-select-file',
            'Select a data file is clicked, and the Choose a data file dialog opens.',
          ),
        },
        {
          id: '3.6',
          type: 'do',
          text: 'Under **Import a data file**, choose your CSV file.',
          confirm: "I've chosen it",
          visual: capture(
            'roster-import-file',
            'The roster CSV is chosen under Import a data file, and the dialog closes.',
          ),
        },
        {
          id: '3.7',
          type: 'checkpoint',
          text: {
            choice: 'file',
            byOption: {
              own: '**What this data file holds** lists your column headings.',
              example:
                '**What this data file holds** lists **name**, **occupation** and **gender**.',
            },
          },
          confirm: 'Looks right',
          guide: '#if-architect-refuses-your-roster',
          visual: capture(
            'roster-file-holds',
            'What this data file holds, listing the roster’s attributes: name, occupation and gender.',
          ),
        },
      ],
    },
    {
      id: 'display',
      tint: 'purple',
      title: 'Make the roster easy to scan',
      guide: '#formatting-the-display-of-the-roster',
      beats: [
        {
          id: '4.1',
          type: 'explain',
          text: 'Each person appears as a card showing their name. Add the details participants need to tell people apart.',
          visual: { kind: 'scene', scene: 'card-detail' },
        },
        {
          id: '4.2',
          type: 'do',
          text: 'Turn on **Card display** and click **Add new display property**. Choose a column under **Attribute**, and type how it should read under **Label**.',
          confirm: "I've added a detail",
          visual: capture(
            'roster-card-display',
            'Card display is turned on, and a display property is added: Attribute gender, Label Gender.',
          ),
        },
        {
          id: '4.3',
          type: 'do',
          text: 'Turn on **Roster sorting** and click **Add new sortable property**. Choose a column participants can sort by, such as occupation.',
          confirm: "I've added it",
          visual: capture(
            'roster-sorting',
            'Roster sorting is turned on, and occupation is added as a sortable property.',
          ),
        },
        {
          id: '4.4',
          type: 'do',
          text: 'Turn on **Roster search**. Tick **name** under **Searchable attributes**, and slide **Search accuracy** to **Low accuracy** for a short list.',
          confirm: 'Search is on',
          guide: '#how-large-is-too-large-for-a-roster',
          visual: capture(
            'roster-search',
            'Roster search is turned on, name is added to Searchable attributes, and Search accuracy is set to Low accuracy.',
          ),
        },
      ],
    },
    {
      id: 'prompt',
      tint: 'mustard',
      title: 'Ask about the roster',
      guide: '#prompting-for-a-roster-item',
      beats: [
        {
          id: '5.1',
          type: 'do',
          text: 'Under **Prompt collection**, click **Create new prompt**, type your question in **Prompt text**, and click **Add**.',
          confirm: "I've added a prompt",
          visual: capture(
            'roster-prompt',
            'Create new prompt is clicked, "Who do you study with?" is typed as the prompt text, and Add is clicked.',
          ),
        },
        {
          id: '5.2',
          type: 'choose',
          choice: 'prompts',
          text: 'Will you ask more than one question about the same people?',
          options: [
            { id: 'one', label: 'One question' },
            { id: 'several', label: 'Several questions' },
          ],
          visual: { kind: 'scene', scene: 'two-questions' },
        },
        {
          id: '5.3',
          type: 'do',
          when: { prompts: 'several' },
          text: 'In each prompt, click **Add new attribute to assign**, then **Select attribute**. Type a name for the question, create it, and choose **True**.',
          confirm: 'Each prompt marks its people',
          guide:
            '#considering-additional-prompt-variables-what-is-an-alter-pool',
          visual: capture(
            'roster-assign',
            'In the prompt, a true/false variable study_together is assigned the value true.',
          ),
        },
        {
          id: '5.4',
          type: 'explain',
          when: { prompts: 'several' },
          text: "Each person can be added only once. Someone added for the first question won't be on the list for the second.",
          visual: { kind: 'scene', scene: 'added-once' },
        },
        {
          id: '5.5',
          type: 'explain',
          when: { prompts: 'several' },
          text: 'To ask the second question about everyone already named, use a **Name Generator (quick add)** stage with a side panel of the people already named.',
          confirm: "I'll set that up",
          guide:
            '#considering-additional-prompt-variables-what-is-an-alter-pool',
          visual: { kind: 'scene', scene: 'side-panels' },
        },
        {
          id: '5.6',
          type: 'do',
          text: 'Click **Finished Editing**.',
          confirm: "I'm back on the timeline",
          visual: capture(
            'roster-finish-editing',
            'Finished Editing is clicked, and the timeline shows the new roster stage.',
          ),
        },
      ],
    },
    {
      id: 'check',
      tint: 'coral',
      title: 'Try it in Preview',
      guide: '#formatting-the-display-of-the-roster',
      beats: [
        {
          id: '6.1',
          type: 'do',
          text: 'Open the roster stage again. In **Preview settings** (the gear), turn off **Start preview with example data**, then click **Preview**.',
          confirm: "It's open",
          visual: capture(
            'roster-preview-open',
            'The roster stage is opened and Preview is clicked; the stage opens in a preview tab.',
          ),
        },
        {
          id: '6.2',
          type: 'checkpoint',
          text: 'Drag a card into the panel beside it. It becomes a person, and leaves the list.',
          confirm: 'It works',
          guide: '#if-architect-refuses-your-roster',
          visual: capture(
            'roster-preview-drag',
            "Preview's roster stage. A card is dragged into the panel beside it and becomes a person.",
          ),
        },
      ],
    },
    {
      id: 'whole',
      tint: 'serpent',
      title: 'Whole-network studies',
      guide: '#tips-for-rosters-in-sociocentric-studies',
      beats: [
        {
          id: '7.1',
          type: 'choose',
          choice: 'whole',
          text: 'Are the people answering on the roster themselves?',
          options: [
            { id: 'yes', label: "Yes, it's a whole-network study" },
            { id: 'no', label: 'No' },
          ],
          visual: { kind: 'scene', scene: 'classroom' },
        },
        {
          id: '6.F',
          type: 'finish',
          when: { whole: 'no' },
          text: `Your roster stage is ready. The [example protocol](${EXAMPLE_PROTOCOL}) shows rosters with more stages.`,
          links: [
            {
              label: 'Read about the roster interface',
              href: '/design-protocols/interface-documentation/name-generator-roster',
            },
          ],
          visual: { kind: 'scene', scene: 'roster-ready' },
        },
        {
          id: '7.2',
          type: 'do',
          when: { whole: 'yes' },
          text: 'On the timeline, click **Add stage here** above your roster stage, and add another **Name Generator for Roster Data** with the same type and file.',
          confirm: "I've added it",
          visual: capture(
            'roster-ego-stage',
            'Add stage here is clicked above the roster stage, and a second roster stage is set up with Person and the same file.',
          ),
        },
        {
          id: '7.3',
          type: 'do',
          when: { whole: 'yes' },
          text: 'Give it one prompt: "Find yourself in this list."',
          confirm: "I've added it",
          visual: capture(
            'roster-ego-prompt',
            'A prompt reading "Find yourself in this list." is added.',
          ),
        },
        {
          id: '7.4',
          type: 'do',
          when: { whole: 'yes' },
          text: 'Edit that prompt: click **Add new attribute to assign**, then **Select attribute**, create **is_ego**, and choose **True**. It marks the participant.',
          confirm: "I've assigned it",
          visual: capture(
            'roster-ego-assign',
            'In the prompt, a true/false variable is_ego is assigned the value true.',
          ),
        },
        {
          id: '7.5',
          type: 'do',
          when: { whole: 'yes' },
          text: 'Turn on **Nomination limits** and set **Minimum number of alters** and **Maximum number of alters** to 1.',
          confirm: 'Both are 1',
          visual: capture(
            'roster-ego-limits',
            'Nomination limits is turned on, and both the minimum and maximum number of alters are set to 1.',
          ),
        },
        {
          id: '7.6',
          type: 'explain',
          when: { whole: 'yes' },
          text: 'Later stages that ask about the people named should leave out the participant. Filter them by `is_ego` in their **Stage filter**.',
          confirm: "I'll filter them",
          guide: '/design-protocols/key-concepts/network-filtering',
          visual: { kind: 'scene', scene: 'ego-filter' },
        },
        {
          id: '7.F',
          type: 'finish',
          when: { whole: 'yes' },
          text: `Participants now find themselves first, then name others. The [example protocol](${EXAMPLE_PROTOCOL}) sets this up.`,
          visual: { kind: 'scene', scene: 'ego-first' },
        },
      ],
    },
  ],
};

export default walkthrough;
