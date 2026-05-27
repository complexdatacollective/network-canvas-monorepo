'use client';

import { useState } from 'react';

export function MailingListForm() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <p className="text-sea-green mt-6 font-bold">
        Thanks! We&apos;ll be in touch.
      </p>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
      }}
      className="phone-landscape:flex-row mt-6 flex flex-col gap-3"
    >
      <input
        type="email"
        required
        placeholder="email@networkcanvas.com"
        aria-label="Email address"
        className="focusable bg-platinum text-cyber-grape placeholder:text-cyber-grape/40 phone-landscape:max-w-xs w-full rounded-2xl px-4 py-3 text-base"
      />
      <button
        type="submit"
        className="focusable bg-cyber-grape font-heading elevation-low shrink-0 rounded-2xl px-6 py-3 text-sm font-bold tracking-wide text-white uppercase transition-transform hover:-translate-y-0.5"
      >
        Join List
      </button>
    </form>
  );
}
