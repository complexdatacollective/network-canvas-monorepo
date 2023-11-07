import getErrors from "@/db/getErrors";
import getEvents from "@/db/getEvents";

export default async function Home() {
  const errors = await getErrors();
  const events = await getEvents();

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <h1>Fresco Error & Analytics Reporting</h1>
      <h2>Errors</h2>
      <div>{JSON.stringify(errors)}</div>
      <h2>Analytics Events</h2>
      <div>{JSON.stringify(events)}</div>
    </main>
  );
}
