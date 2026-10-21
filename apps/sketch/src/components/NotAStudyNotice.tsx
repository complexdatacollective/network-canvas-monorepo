type Props = {
  id: string;
  hint: string | null;
  onTryExample: () => void;
};

const FALLBACK_HINT =
  'Sketch needs at least one research question about people, their relationships or their networks.';

export const NotAStudyNotice = ({ id, hint, onTryExample }: Props) => (
  <div
    id={id}
    role="alert"
    className="bg-tangerine-wash flex items-start gap-4 rounded-[18px] px-5 py-[18px]"
  >
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      aria-hidden="true"
      focusable="false"
      className="flex-none"
    >
      <circle cx="20" cy="20" r="19" className="fill-tangerine" />
      <path
        d="M13 25 L20 12 L27 24"
        fill="none"
        className="stroke-ink-strong"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="1 5"
      />
      <circle cx="20" cy="12" r="3.6" className="fill-ink-strong" />
      <circle cx="13" cy="25" r="3.6" className="fill-ink-strong" />
      <circle cx="27" cy="24" r="3.6" className="fill-ink-strong" />
    </svg>
    <div className="flex flex-col gap-1.5">
      <strong className="font-display text-ink text-lg font-extrabold">
        These do not read as research questions yet
      </strong>
      <p className="text-ink m-0 text-[0.9375rem]">
        {hint?.trim() || FALLBACK_HINT}{' '}
        <button
          type="button"
          onClick={onTryExample}
          className="text-ink hover:text-ink-strong cursor-pointer border-0 bg-transparent p-0 font-[inherit] font-semibold underline"
        >
          Try an example
        </button>
      </p>
    </div>
  </div>
);
