import Link from "next/link";
import { buttonClass } from "@/components/ui/primitives";

export default function CommunityNotFound() {
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-ink-100 bg-white p-8 text-center shadow-soft">
      <h1 className="text-2xl font-semibold text-ink-950">This is no longer available</h1>
      <p className="mt-3 text-[15px] leading-7 text-ink-700">
        The page you opened was removed, or you no longer have access to it. Nothing is wrong with your account.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/community" className={buttonClass("primary")}>
          Go to ideas
        </Link>
        <Link href="/community/notifications" className={buttonClass("secondary")}>
          Back to notifications
        </Link>
      </div>
    </div>
  );
}
