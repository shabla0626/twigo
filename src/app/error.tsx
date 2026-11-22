"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-sky-50 via-white to-violet-50 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-ink-600">An unexpected error occurred. Please try again.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full bg-accent-700 px-4 py-2.5 text-sm font-semibold text-white"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
