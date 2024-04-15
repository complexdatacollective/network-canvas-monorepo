import baseUrl from '~/baseUrl';

export default async function Home() {
  const homeRes = await fetch(baseUrl);
  const postsRes = await fetch(`${baseUrl}/posts/12?page=1`);

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      {homeRes.ok ? (
        <h1 className="text-center text-4xl font-bold">
          {await homeRes.text()}
        </h1>
      ) : (
        <h1 className="text-center text-4xl font-bold">Loading...</h1>
      )}
      {postsRes.ok ? (
        <h1 className="text-center text-4xl font-bold">
          {await postsRes.text()}
        </h1>
      ) : (
        <h1 className="text-center text-4xl font-bold">Loading...</h1>
      )}
    </main>
  );
}
