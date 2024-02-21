import Link from 'next/link';

export default function NotFound() {
  return (
    <html>
      <body>
        <div className="prose prose-sm prose-slate mx-auto my-10 md:prose-base">
          <h1>404 - Not found</h1>
          <div className="h-[2px] w-full bg-black" />
          <h2>The requested page could not be found.</h2>
          <p>
            This is probably because the page has been moved or deleted. We
            apologize for any inconvenience this has caused.
          </p>
          <p>Please try the following:</p>
          <ul>
            <li>
              Use the <b>Return Home</b> button (at the bottom of this page) to
              try to locate to the home page.
            </li>
            <li>Check your address bar for spelling mistakes or typos.</li>
            <li>
              Contact the project team if you believe you are seeing this page
              in error, including details of the page you were trying to reach.
            </li>
          </ul>
          <Link
            className="btn rounded-md bg-slate-100 p-4 text-center text-violet-600 hover:bg-slate-200"
            style={{ textDecoration: 'none' }}
            href="/"
          >
            Return Home
          </Link>
        </div>
      </body>
    </html>
  );
}
