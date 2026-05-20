  type Props = { searchParams: Promise<{ missing?: string }> };

  export default async function UnsupportedPage({ searchParams }: Props) {
    const { missing } = await searchParams;
    const missingList = missing ? missing.split(",") : [];

    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-3xl font-bold mb-4">Your browser can&apos;t run this</h1>
        <p className="text-gray-600 mb-6">
          AI Video Cutter needs modern desktop browser features that this browser is missing.
          Please use a recent version of <b>Chrome</b>, <b>Edge</b>, or <b>Brave</b> on a laptop or desktop.
        </p>
        {missingList.length > 0 && (
          <details className="text-sm text-gray-500">
            <summary>Technical details</summary>
            <ul className="list-disc pl-5 mt-2">
              {missingList.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </details>
        )}
      </main>
    );
  }

