"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "../ui/primitives";

/** Uploads one file to /api/files and refreshes the page. */
export function FileUpload({ scope, groupId, label = "Upload a file", accept }: { scope: "GROUP_FILE" | "PROFILE_PHOTO"; groupId?: string; label?: string; accept?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function upload(file: File) {
    setBusy(true);
    setStatus(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("scope", scope);
    if (groupId) fd.set("groupId", groupId);
    try {
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!data.ok) setStatus({ tone: "error", text: data.error ?? "Upload failed." });
      else {
        setStatus({ tone: "ok", text: `${file.name} uploaded.` });
        router.refresh();
      }
    } catch {
      setStatus({ tone: "error", text: "Upload failed. Check your connection." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        id={`upload-${scope}`}
        aria-label={label}
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void upload(f);
        }}
      />
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Uploading…" : label}
      </Button>
      <p role="status" aria-live="polite" className={status?.tone === "error" ? "text-sm text-red-700" : "text-sm text-emerald-700"}>
        {status?.text}
      </p>
    </div>
  );
}
