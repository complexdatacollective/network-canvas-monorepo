export default async function Home() {
  const response = await fetch('http://localhost:8787');

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      {response.ok ? (
        <h1 className="text-center text-4xl font-bold">
          {await response.text()}
        </h1>
      ) : (
        <h1 className="text-center text-4xl font-bold">Loading...</h1>
      )}
    </main>
  );
}
