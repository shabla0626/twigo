import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-sky-50 via-white to-violet-50 px-4">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold text-accent-700">404</p>
        <h1 className="mt-2 text-3xl font-semibold">Page not found</h1>
        <p className="mt-3 text-ink-600">The page you are looking for does not exist or has moved.</p>
        <Link href="/" className="mt-6 inline-block rounded-full bg-accent-700 px-4 py-2.5 text-sm font-semibold text-white">
          Back to home
        </Link>
      </div>
    </main>
  );
}
