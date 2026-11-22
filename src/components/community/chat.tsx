"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessageDTO } from "@/realtime/chat-service";
import { Button, cn } from "../ui/primitives";
import { IconPaperclip } from "./icons";
import { getSocket } from "./socket";
import { MemberAvatar, timeAgo } from "./ui";

type Member = { id: string; name: string };
type Pending = { clientId: string; body: string; replyToId: string | null; attachments: { id: string; name: string }[]; failed?: string };
type Conn = "connecting" | "online" | "offline";

type Ack = { ok: boolean; error?: string; revoked?: boolean; message?: ChatMessageDTO; messages?: ChatMessageDTO[]; hasMore?: boolean; presence?: string[]; canPost?: boolean };

function newClientId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emitAck(event: string, payload: unknown, timeoutMs = 10_000): Promise<Ack> {
  const s = getSocket();
  return new Promise((resolve) => {
    s.timeout(timeoutMs).emit(event, payload, (err: Error | null, res: Ack) => resolve(err ? { ok: false, error: "No response from the server." } : res));
  });
}

const PENDING_KEY = (channelId: string) => `chat-pending:${channelId}`;

export function GroupChat({ channelId, groupId, me, members }: { channelId: string; groupId: string; me: Member; members: Member[] }) {
  const [messages, setMessages] = useState<ChatMessageDTO[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [conn, setConn] = useState<Conn>("connecting");
  const [online, setOnline] = useState<string[]>([]);
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessageDTO | null>(null);
  const [editing, setEditing] = useState<ChatMessageDTO | null>(null);
  const [attachments, setAttachments] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  const [canPost, setCanPost] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const atBottom = useRef(true);
  const lastTyping = useRef(0);
  const pendingRef = useRef<Pending[]>([]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  const memberName = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const upsert = useCallback((m: ChatMessageDTO) => {
    setMessages((prev) => {
      const i = prev.findIndex((x) => x.id === m.id);
      if (i >= 0) {
        const next = prev.slice();
        next[i] = m;
        return next;
      }
      return [...prev, m].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
    if (m.clientId) setPending((p) => p.filter((x) => x.clientId !== m.clientId));
  }, []);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Persist unsent messages so a reload or crash does not lose them.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(PENDING_KEY(channelId));
      // Read after mount (not during render) so server and client HTML match.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setPending(JSON.parse(raw) as Pending[]);
    } catch {
      /* storage unavailable */
    }
  }, [channelId]);
  useEffect(() => {
    try {
      if (pending.length) sessionStorage.setItem(PENDING_KEY(channelId), JSON.stringify(pending));
      else sessionStorage.removeItem(PENDING_KEY(channelId));
    } catch {
      /* ignore */
    }
  }, [pending, channelId]);

  const sendPending = useCallback(
    async (p: Pending) => {
      const res = await emitAck("message:send", { channelId, body: p.body, clientId: p.clientId, replyToId: p.replyToId, attachmentIds: p.attachments.map((a) => a.id) });
      if (res.ok && res.message) {
        upsert(res.message);
        scrollToEnd();
      } else {
        if (res.revoked) setRevoked(true);
        setPending((all) => all.map((x) => (x.clientId === p.clientId ? { ...x, failed: res.error ?? "Not sent" } : x)));
      }
    },
    [channelId, upsert, scrollToEnd],
  );

  // Connection lifecycle: join on every (re)connect, then resend anything unsent.
  useEffect(() => {
    const s = getSocket();
    let cancelled = false;
    const join = async () => {
      setConn("online");
      const res = await emitAck("channel:join", { channelId });
      if (cancelled) return;
      if (!res.ok) {
        setRevoked(true);
        return;
      }
      setRevoked(false);
      setCanPost(res.canPost !== false);
      setMessages(res.messages ?? []);
      setLoaded(true);
      setHasMore(Boolean(res.hasMore));
      setOnline(res.presence ?? []);
      scrollToEnd();
      for (const p of pendingRef.current) void sendPending({ ...p, failed: undefined });
    };
    const onDisconnect = () => setConn("offline");
    const onConnectError = () => setConn("offline");
    const onNew = (m: ChatMessageDTO) => {
      if (m.channelId !== channelId) return;
      upsert(m);
      if (atBottom.current) scrollToEnd();
      if (document.visibilityState === "visible") s.emit("read", { channelId });
    };
    const onUpdated = (m: ChatMessageDTO) => m.channelId === channelId && upsert(m);
    const onPresence = (p: { channelId: string; userIds: string[] }) => p.channelId === channelId && setOnline(p.userIds);
    const onTyping = (p: { channelId: string; userId: string; name: string }) => {
      if (p.channelId !== channelId) return;
      setTyping((t) => ({ ...t, [p.userId]: { name: p.name, until: Date.now() + 4000 } }));
    };
    const onRevoked = (p: { groupId: string }) => p.groupId === groupId && setRevoked(true);

    s.on("connect", join);
    s.on("disconnect", onDisconnect);
    s.on("connect_error", onConnectError);
    s.on("message:new", onNew);
    s.on("message:updated", onUpdated);
    s.on("presence", onPresence);
    s.on("typing", onTyping);
    s.on("access:revoked", onRevoked);
    if (s.connected) void join();
    else s.connect();
    const tick = setInterval(() => setTyping((t) => Object.fromEntries(Object.entries(t).filter(([, v]) => v.until > Date.now()))), 1500);
    return () => {
      cancelled = true;
      clearInterval(tick);
      s.emit("channel:leave", { channelId });
      s.off("connect", join);
      s.off("disconnect", onDisconnect);
      s.off("connect_error", onConnectError);
      s.off("message:new", onNew);
      s.off("message:updated", onUpdated);
      s.off("presence", onPresence);
      s.off("typing", onTyping);
      s.off("access:revoked", onRevoked);
    };
  }, [channelId, groupId, upsert, scrollToEnd, sendPending]);

  async function loadMore() {
    const first = messages[0];
    if (!first) return;
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const res = await emitAck("history:more", { channelId, before: first.id });
    if (res.ok) {
      setMessages((prev) => [...(res.messages ?? []), ...prev]);
      setHasMore(Boolean(res.hasMore));
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - prevHeight;
      });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const body = text.trim();
    if (editing) {
      if (!body) return;
      const res = await emitAck("message:edit", { channelId, messageId: editing.id, body });
      if (!res.ok) setError(res.error ?? "Could not edit.");
      else if (res.message) upsert(res.message);
      setEditing(null);
      setText("");
      return;
    }
    if (!body && !attachments.length) return;
    if (body.length > 4000) {
      setError("Messages can be at most 4,000 characters.");
      return;
    }
    const p: Pending = { clientId: newClientId(), body, replyToId: replyTo?.id ?? null, attachments };
    setPending((all) => [...all, p]);
    setText("");
    setReplyTo(null);
    setAttachments([]);
    scrollToEnd();
    if (getSocket().connected) await sendPending(p);
  }

  async function remove(m: ChatMessageDTO) {
    if (!confirm("Delete this message for everyone?")) return;
    const res = await emitAck("message:delete", { channelId, messageId: m.id });
    if (!res.ok) setError(res.error ?? "Could not delete.");
    else if (res.message) upsert(res.message);
  }

  async function attach(file: File) {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("scope", "CHAT_ATTACHMENT");
    fd.set("groupId", groupId);
    try {
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const data = (await res.json()) as { ok: boolean; error?: string; file?: { id: string; name: string } };
      if (!data.ok || !data.file) setError(data.error ?? "Upload failed.");
      else setAttachments((a) => [...a, { id: data.file!.id, name: data.file!.name }].slice(0, 5));
    } catch {
      setError("Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onType(v: string) {
    setText(v);
    if (Date.now() - lastTyping.current > 2500 && v) {
      lastTyping.current = Date.now();
      getSocket().emit("typing", { channelId });
    }
  }

  const typingNames = Object.entries(typing)
    .filter(([id]) => id !== me.id)
    .map(([, v]) => v.name);

  if (revoked) {
    return (
      <div className="rounded-2xl border border-ink-100 bg-white p-8 text-center" role="alert">
        <p className="font-semibold text-ink-950">You no longer have access to this chat.</p>
        <p className="mt-1 text-sm text-ink-600">You may have left the group, or the group was suspended.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <section className="flex h-[calc(100dvh-25rem)] min-h-[19rem] flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white lg:h-[calc(100dvh-17rem)] lg:min-h-[26rem]" aria-label="Group chat">
        <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5 text-sm">
          <span className="font-semibold text-ink-950">Group chat</span>
          <span className={cn("inline-flex items-center gap-1.5", conn === "online" ? "text-emerald-700" : "text-amber-700")} role="status" data-testid="chat-status">
            <span className={cn("h-2 w-2 rounded-full", conn === "online" ? "bg-emerald-500" : "bg-amber-500")} />
            {conn === "online" ? "Connected" : conn === "connecting" ? "Connecting…" : "Reconnecting… messages will be sent when you are back online"}
          </span>
        </div>
        <div
          ref={listRef}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
          onScroll={(e) => {
            const el = e.currentTarget;
            atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          aria-live="polite"
          aria-relevant="additions"
          data-testid="chat-messages"
        >
          {hasMore && (
            <div className="text-center">
              <Button type="button" variant="ghost" size="sm" onClick={() => void loadMore()}>
                Load earlier messages
              </Button>
            </div>
          )}
          {!loaded && <p className="py-10 text-center text-sm text-ink-500">Loading messages…</p>}
          {loaded && !messages.length && !pending.length && <p className="py-10 text-center text-sm text-ink-500">No messages yet. Say hello to the group.</p>}
          {messages.map((m) => {
            const mine = m.author?.id === me.id;
            // A line written by the site itself: someone joined, left, or became coordinator.
            if (m.kind === "SYSTEM") {
              return (
                <p key={m.id} className="py-1 text-center text-xs text-ink-500" data-message-id={m.id} data-system-line>
                  {m.body} ·{" "}
                  <time dateTime={m.createdAt} title={new Date(m.createdAt).toLocaleString("en-US")}>
                    {timeAgo(m.createdAt)}
                  </time>
                </p>
              );
            }
            return (
              <div key={m.id} className="group flex gap-3" data-message-id={m.id}>
                <MemberAvatar name={m.author?.name ?? "Former member"} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold text-ink-950">{m.author?.name ?? "Former member"}</span>{" "}
                    {m.author?.staff && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-700">Administrator</span>}{" "}
                    <time className="text-xs text-ink-500" dateTime={m.createdAt} title={new Date(m.createdAt).toLocaleString("en-US")}>
                      {timeAgo(m.createdAt)}
                    </time>
                    {m.editedAt && !m.deleted && <span className="text-xs text-ink-500"> (edited)</span>}
                  </p>
                  {m.replyTo && (
                    <p className="mt-0.5 truncate border-l-2 border-accent-300 pl-2 text-xs text-ink-500">
                      ↪ {m.replyTo.authorName ? `${m.replyTo.authorName}: ` : ""}
                      {m.replyTo.excerpt}
                    </p>
                  )}
                  {m.deleted ? (
                    <p className="text-sm italic text-ink-500">Message deleted</p>
                  ) : (
                    <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-ink-800">{m.body}</p>
                  )}
                  {m.attachments.length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-2">
                      {m.attachments.map((a) => (
                        <li key={a.id}>
                          {a.mimeType.startsWith("image/") ? (
                            <a href={`/api/files/${a.id}`} target="_blank" rel="noopener noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element -- authorized private image */}
                              <img src={`/api/files/${a.id}`} alt={a.name} className="max-h-40 rounded-lg ring-1 ring-ink-100" />
                            </a>
                          ) : (
                            <a href={`/api/files/${a.id}?download=1`} className="inline-flex items-center gap-1 rounded-lg bg-ink-50 px-2.5 py-1 text-sm text-accent-800 ring-1 ring-ink-100 hover:bg-accent-50">
                              <IconPaperclip className="h-4 w-4" /> {a.name}
                            </a>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!m.deleted && canPost && (
                    <div className="mt-0.5 flex gap-2 text-xs text-ink-500 opacity-100 sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                      <button type="button" className="hover:text-accent-800" onClick={() => setReplyTo(m)}>
                        Reply
                      </button>
                      {mine && (
                        <>
                          <button
                            type="button"
                            className="hover:text-accent-800"
                            onClick={() => {
                              setEditing(m);
                              setText(m.body);
                            }}
                          >
                            Edit
                          </button>
                          <button type="button" className="hover:text-red-700" onClick={() => void remove(m)}>
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {pending.map((p) => (
            <div key={p.clientId} className="flex gap-3 opacity-70" data-pending="true">
              <MemberAvatar name={me.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-semibold text-ink-950">{me.name}</span> <span className="text-xs text-ink-500">{p.failed ? `Not sent: ${p.failed}` : "Sending…"}</span>
                </p>
                <p className="whitespace-pre-wrap break-words text-[15px] leading-6 text-ink-800">{p.body}</p>
                {p.failed && (
                  <span className="mt-1 flex gap-3 text-xs">
                    <button type="button" className="text-accent-700 underline" onClick={() => void sendPending({ ...p, failed: undefined })}>
                      Retry
                    </button>
                    <button type="button" className="text-ink-500 underline" onClick={() => setPending((all) => all.filter((x) => x.clientId !== p.clientId))}>
                      Discard
                    </button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="min-h-5 px-4 text-xs text-ink-500" aria-live="polite">
          {typingNames.length > 0 && `${typingNames.slice(0, 3).join(", ")} ${typingNames.length === 1 ? "is" : "are"} typing…`}
        </div>
        {canPost ? (
          <form onSubmit={(e) => void submit(e)} className="border-t border-ink-100 p-3">
            {error && (
              <p className="mb-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            )}
            {(replyTo || editing) && (
              <div className="mb-2 flex items-center justify-between rounded-lg bg-accent-50 px-3 py-1.5 text-xs text-accent-900">
                <span className="truncate">{editing ? "Editing your message" : `Replying to ${replyTo?.author?.name ?? "message"}: ${replyTo?.body.slice(0, 80)}`}</span>
                <button
                  type="button"
                  className="ml-2 font-semibold"
                  onClick={() => {
                    setReplyTo(null);
                    if (editing) setText("");
                    setEditing(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            )}
            {attachments.length > 0 && (
              <ul className="mb-2 flex flex-wrap gap-2 text-xs">
                {attachments.map((a) => (
                  <li key={a.id} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2.5 py-1">
                    {a.name}
                    <button type="button" aria-label={`Remove ${a.name}`} onClick={() => setAttachments((all) => all.filter((x) => x.id !== a.id))}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" className="sr-only" id="chat-file" onChange={(e) => e.target.files?.[0] && void attach(e.target.files[0])} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading || Boolean(editing)}
                className="rounded-full p-2.5 text-ink-600 hover:bg-ink-100 disabled:opacity-50"
                aria-label="Attach a file"
              >
                <IconPaperclip className="h-5 w-5" />
              </button>
              <label htmlFor="chat-input" className="sr-only">
                Message
              </label>
              <textarea
                id="chat-input"
                value={text}
                onChange={(e) => onType(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder={uploading ? "Uploading…" : "Write a message…"}
                title="Press Enter to send. Shift+Enter starts a new line."
                className="max-h-40 min-h-11 flex-1 resize-y rounded-2xl border-0 px-4 py-2.5 text-sm ring-1 ring-inset ring-ink-300 focus:ring-2 focus:ring-accent-600"
              />
              <Button type="submit" disabled={uploading}>
                {editing ? "Save" : "Send"}
              </Button>
            </div>
          </form>
        ) : (
          <p className="border-t border-ink-100 p-4 text-sm text-ink-600">This group is archived; chat is read-only.</p>
        )}
      </section>
      <aside className="rounded-2xl border border-ink-100 bg-white p-4" aria-label="Who is online">
        <h2 className="text-sm font-semibold text-ink-950">Members</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {members.map((m) => {
            const isOn = online.includes(m.id);
            return (
              <li key={m.id} className="flex items-center gap-2">
                <span className={cn("h-2 w-2 rounded-full", isOn ? "bg-emerald-500" : "bg-ink-200")} aria-hidden="true" />
                <span className="truncate text-ink-800">{memberName.get(m.id)}</span>
                <span className="sr-only">{isOn ? "online" : "offline"}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 text-xs leading-5 text-ink-500">Chat is visible only to current group members and is saved so you can read it later. Everyone who joins or leaves is shown in the chat. Administrators have no special view: they see a message only if someone reports it, and an administrator who joins as a member sees the chat only from that moment and is labelled “Administrator”.</p>
      </aside>
    </div>
  );
}
