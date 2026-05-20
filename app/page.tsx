
  "use client";
  import { showBanner } from "@/lib/error-banner-store";

  export default function Page() {
    return (
      <main className="p-8">
        <button
          className="px-4 py-2 bg-red-600 text-white rounded"
          onClick={() => showBanner({ message: "test", variant: "error" })}
        >
          Trigger banner
        </button>
      </main>
    );
  }
