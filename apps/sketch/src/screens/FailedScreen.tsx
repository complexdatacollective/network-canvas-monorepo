import { ctaButton, paperButton } from '../components/buttonStyles.ts';
import { ScreenHeading } from '../components/ScreenHeading.tsx';
import { SiteHeader } from '../components/SiteHeader.tsx';
import { excerpt } from '../lib/format.ts';

type Props = {
  message: string;
  description: string;
  onRetry: () => void;
  onEdit: () => void;
};

export const FailedScreen = ({
  message,
  description,
  onRetry,
  onEdit,
}: Props) => (
  <>
    <SiteHeader onHome={onEdit} />
    <main className="mx-auto flex w-full max-w-[880px] flex-col gap-6 px-4 pt-10 pb-[72px] sm:px-8 sm:pt-16">
      <ScreenHeading
        focusOnMount
        className="font-display text-[clamp(2rem,4vw,2.75rem)] leading-[1.1] font-black tracking-[-0.02em]"
      >
        Sketch couldn’t finish this one
      </ScreenHeading>
      <section
        aria-label="What happened"
        className="bg-paper text-ink shadow-card flex flex-col gap-[18px] rounded-[28px] p-5 sm:p-7"
      >
        <div
          role="alert"
          className="bg-danger-wash flex items-start gap-4 rounded-[18px] px-5 py-[18px]"
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            aria-hidden="true"
            focusable="false"
            className="flex-none"
          >
            <circle cx="20" cy="20" r="19" className="fill-danger" />
            <path
              d="M13 25 L20 12"
              fill="none"
              className="stroke-white"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M20 12 L27 24"
              fill="none"
              className="stroke-white"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeDasharray="1 5"
            />
            <circle cx="20" cy="12" r="3.6" className="fill-white" />
            <circle cx="13" cy="25" r="3.6" className="fill-white" />
            <circle cx="27" cy="24" r="3.6" className="fill-white" />
          </svg>
          <div className="flex flex-col gap-1.5">
            <strong className="font-display text-lg font-extrabold">
              Something went wrong while sketching
            </strong>
            <p className="m-0 text-[0.9375rem]">{message}</p>
            <p className="m-0 text-[0.9375rem]">
              Trying again usually works. If it keeps failing, a shorter or more
              specific description can help.
            </p>
          </div>
        </div>
        <div className="border-paper-line text-ink-muted flex flex-col gap-2 rounded-[18px] border-[1.5px] border-dashed px-[18px] py-3.5 text-[0.9375rem]">
          <span className="text-xs font-bold tracking-[0.06em] uppercase">
            Your description
          </span>
          <p className="m-0">{excerpt(description)}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onEdit} className={paperButton}>
            Edit the description
          </button>
          <button type="button" onClick={onRetry} className={ctaButton}>
            Try again
          </button>
        </div>
      </section>
    </main>
  </>
);
