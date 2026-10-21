import { MotionConfig } from 'motion/react';
import type { ReactNode } from 'react';

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '@codaco/fresco-ui/Accordion';

// The item the privacy note under the form links to (#what-we-keep).
export const WHAT_WE_KEEP = 'what-we-keep';

const ITEMS: { value: string; question: string; answer: ReactNode }[] = [
  {
    value: 'produce',
    question: 'What does Sketch produce?',
    answer: (
      <>
        <p>
          A Network Canvas protocol in schema 8, the format that Architect,
          Interviewer and Fresco read. It contains a codebook of node types,
          relationships and variables, each variable with an input control
          chosen for its question; the interview’s stages in order, with titles,
          prompts and introductory screens written for participants; and the
          skip logic and filters the design calls for.
        </p>
        <p>
          The first stage holds researcher notes, to be deleted before fielding:
          the rationale for each question’s stages and measures, and any
          conventional choices made on your behalf. Where the design needs a
          roster, Sketch adds placeholder roster files for you to replace with
          your own. Images, audio and video are left for you to add in
          Architect.
        </p>
      </>
    ),
  },
  {
    value: 'models',
    question: 'Which models design the protocol?',
    answer: (
      <p>
        Claude Opus 5.5 designs the protocol: it derives the people,
        relationships and measures your questions call for and builds the
        interview from them. Claude Haiku 5.5 does two smaller tasks. It first
        screens what you entered to confirm that it describes a study, and once
        the design is complete it edits the titles, prompts and screen text for
        participants. Where ChatGPT is available you can use it instead, or run
        both and compare the two designs side by side.
      </p>
    ),
  },
  {
    value: 'questions',
    question: 'How should I write my research questions?',
    answer: (
      <p>
        As you would state them in a proposal or paper. Sketch keeps what you
        specify, such as the population, the study design, reference periods and
        named instruments. Where you leave something out, it makes the
        conventional choice for that kind of study and records it in the
        researcher notes that open the protocol, so that you can revise it.
      </p>
    ),
  },
  {
    value: 'validation',
    question: 'Does Sketch check the protocol?',
    answer: (
      <p>
        Every protocol is validated against the Network Canvas protocol schema
        before it is returned. If the first design fails validation or Sketch’s
        own consistency checks, the problems are sent back to the model for one
        further attempt, and only a protocol that validates is offered to you.
        Validation establishes that the protocol is well formed. It does not
        establish that the instrument suits your study: named instruments are
        reproduced from memory and should be checked against the published
        versions, and the protocol should be reviewed and piloted before it is
        fielded.
      </p>
    ),
  },
  {
    value: 'edit',
    question: 'Can I edit the result?',
    answer: (
      <p>
        Yes. Open in Architect sends the protocol to Architect in a new tab,
        where you can change any part of it, add media and replace the
        placeholder rosters. You can also download it as a .netcanvas file and
        import it into Architect later.
      </p>
    ),
  },
  {
    value: WHAT_WE_KEEP,
    question: 'What is stored?',
    answer: (
      <p>
        For every run, Sketch logs the research questions and synopsis you
        entered, the protocol it generated, the models it used, how long it took
        and what it cost. When you compare two designs, it also logs which one
        you preferred. We read these logs to make Sketch better. Nothing else is
        stored, and Sketch never sees what happens in Architect.
      </p>
    ),
  },
  {
    value: 'experiment',
    question: 'Is Sketch free to use, and is it a finished product?',
    answer: (
      <p>
        Sketch is an experiment from the Network Canvas project, offered without
        charge while we learn how useful it is to researchers. It is not a
        finished product, and its designs should be reviewed before they are
        fielded. Each run has a cost, so Sketch has a daily spending limit
        shared by everyone who uses it. When the limit is reached, generation
        pauses until the following day.
      </p>
    ),
  },
];

type Props = {
  open: string[];
  onOpenChange: (open: string[]) => void;
};

export const Faq = ({ open, onOpenChange }: Props) => (
  <section
    id="faq"
    aria-labelledby="faq-title"
    className="border-night-dot grid scroll-mt-6 grid-cols-1 gap-6 border-t pt-10 pb-14 sm:pt-16 sm:pb-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.9fr)] lg:gap-16"
  >
    <div className="flex flex-col gap-3 lg:sticky lg:top-8 lg:self-start">
      <h2
        id="faq-title"
        className="font-display m-0 text-[1.625rem] font-black tracking-[-0.015em] sm:text-4xl"
      >
        Questions
      </h2>
      <p className="text-night-text m-0 max-w-[36ch] text-[0.9375rem] sm:text-base">
        What Sketch builds, how it builds it, and what happens to what you
        enter.
      </p>
    </div>
    <MotionConfig reducedMotion="user">
      <Accordion<string>
        multiple
        value={open}
        onValueChange={(value) => onOpenChange(value)}
        className="border-night-line gap-0 border-b"
      >
        {ITEMS.map((item) => (
          <AccordionItem
            key={item.value}
            value={item.value}
            id={item.value === WHAT_WE_KEEP ? WHAT_WE_KEEP : undefined}
            className="border-night-line scroll-mt-6 border-t"
          >
            <AccordionHeader className="m-0">
              <AccordionTrigger className="font-display hover:text-mustard-light min-h-11 border-0 bg-transparent py-4 text-left text-[1.0625rem] font-extrabold tracking-normal text-white normal-case sm:py-5 sm:text-[1.1875rem]">
                {item.question}
              </AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel className="mt-0">
              <div className="text-night-text flex max-w-[68ch] flex-col gap-3 pb-5 text-[0.9375rem] sm:text-base [&_p]:m-0">
                {item.answer}
              </div>
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </MotionConfig>
  </section>
);
