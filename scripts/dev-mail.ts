/**
 * LOCAL test mail server for development and automated tests.
 *
 *   npm run mail:dev        (also started automatically by `npm run dev`
 *                            when SMTP_HOST is 127.0.0.1 / localhost)
 *
 * - SMTP on 127.0.0.1:2525 accepts every message and saves it to .dev-mail/
 *   (a .eml file plus a small .json summary).
 * - A web inbox on http://127.0.0.1:8025 lists the captured messages and
 *   shows them with clickable links (activation, password reset, ...).
 *
 * Nothing leaves this computer: captured emails are NEVER delivered to real
 * inboxes. Matching .env settings:
 *   SMTP_HOST="127.0.0.1"  SMTP_PORT="2525"  EMAIL_FROM="no-reply@cowork.test"
 */
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SMTPServer } from "smtp-server";

// ------------------------------------------------------------------ SMTP

export function startDevMail(opts: { port?: number; dir?: string; quiet?: boolean } = {}) {
  const port = opts.port ?? Number(process.env.DEV_MAIL_PORT ?? 2525);
  const dir = path.resolve(opts.dir ?? ".dev-mail");
  mkdirSync(dir, { recursive: true });
  let n = 0;
  const server = new SMTPServer({
    authOptional: true,
    disabledCommands: ["STARTTLS"],
    logger: false,
    onAuth(_auth, _session, cb) {
      cb(null, { user: "local" }); // accept any login so production-like settings also work locally
    },
    onData(stream, session, done) {
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const to = session.envelope.rcptTo.map((r) => r.address);
        const subject = parseMessage(raw).subject;
        const base = `${Date.now()}-${++n}`;
        writeFileSync(path.join(dir, `${base}.eml`), raw);
        writeFileSync(path.join(dir, `${base}.json`), JSON.stringify({ to, subject, receivedAt: new Date().toISOString() }, null, 2));
        if (!opts.quiet) console.log(`[mail] captured for ${to.join(", ")}: ${subject}`);
        done(null);
      });
    },
  });
  return new Promise<SMTPServer>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

// ------------------------------------------------------------------ minimal MIME reader (enough for this app's emails)

function decodeQuotedPrintable(s: string): Buffer {
  const soft = s.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    const c = soft[i]!;
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(...Buffer.from(c, "utf8"));
  }
  return Buffer.from(bytes);
}

function decodeWords(v: string): string {
  return v.replace(/=\?([^?]+)\?([QqBb])\?([^?]*)\?=\s*/g, (_m, _cs, enc: string, txt: string) =>
    enc.toUpperCase() === "B" ? Buffer.from(txt, "base64").toString("utf8") : decodeQuotedPrintable(txt.replace(/_/g, " ")).toString("utf8"),
  );
}

function splitHeaders(part: string): { headers: Record<string, string>; body: string } {
  const idx = part.search(/\r?\n\r?\n/);
  const head = idx === -1 ? part : part.slice(0, idx);
  const body = idx === -1 ? "" : part.slice(idx).replace(/^\r?\n\r?\n/, "");
  const headers: Record<string, string> = {};
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const m = /^([^:]+):\s*(.*)$/.exec(line);
    if (m) headers[m[1]!.toLowerCase()] = m[2]!;
  }
  return { headers, body };
}

function decodeBody(headers: Record<string, string>, body: string): string {
  const enc = (headers["content-transfer-encoding"] ?? "").toLowerCase();
  if (enc === "quoted-printable") return decodeQuotedPrintable(body).toString("utf8");
  if (enc === "base64") return Buffer.from(body.replace(/\s+/g, ""), "base64").toString("utf8");
  return body;
}

export function parseMessage(raw: string): { from: string; to: string; subject: string; date: string; text: string } {
  const { headers, body } = splitHeaders(raw);
  let text = "";
  const type = headers["content-type"] ?? "text/plain";
  const boundary = /boundary="?([^";]+)"?/i.exec(type)?.[1];
  if (/^multipart\//i.test(type) && boundary) {
    const parts = body.split(`--${boundary}`).slice(1);
    const plain = parts.map(splitHeaders).find((p) => /text\/plain/i.test(p.headers["content-type"] ?? "text/plain"));
    if (plain) text = decodeBody(plain.headers, plain.body);
  } else text = decodeBody(headers, body);
  return {
    from: decodeWords(headers.from ?? ""),
    to: decodeWords(headers.to ?? ""),
    subject: decodeWords(headers.subject ?? ""),
    date: headers.date ?? "",
    text: text.replace(/\r\n/g, "\n").trimEnd(),
  };
}

// ------------------------------------------------------------------ web inbox

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const linkify = (s: string) => esc(s).replace(/https?:\/\/[^\s<>"']+/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);

function page(title: string, body: string, refresh = false) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${refresh ? '<meta http-equiv="refresh" content="5">' : ""}<title>${esc(title)}</title>
<style>
body{font:15px/1.5 system-ui,sans-serif;margin:0;background:#f5f7fa;color:#14213d}
header{background:#fff;border-bottom:1px solid #e2e8f0;padding:14px 20px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
header h1{font-size:18px;margin:0}main{max-width:960px;margin:0 auto;padding:20px}
.note{background:#fff7e6;border:1px solid #f5d48a;border-radius:8px;padding:10px 14px;margin-bottom:16px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:8px}
td,th{padding:10px 12px;border-bottom:1px solid #eef2f7;text-align:left;vertical-align:top}th{font-size:13px;color:#52607a}
a{color:#0f6f7a}pre{white-space:pre-wrap;word-break:break-word;background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:16px;font:14px/1.6 ui-monospace,Consolas,monospace}
.meta{background:#fff;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:12px}.meta div{margin:2px 0}
button{font:inherit;padding:6px 12px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer}
</style></head><body><header><h1>Local test inbox</h1><a href="/">All messages</a></header><main>
<p class="note"><strong>Test emails only.</strong> Messages here were captured on this computer and were <strong>not</strong> delivered to anyone's real inbox.</p>
${body}</main></body></html>`;
}

function listMessages(dir: string) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .map((f) => {
      const id = f.slice(0, -5);
      const meta = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as { to: string[]; subject: string; receivedAt: string };
      return { id, ...meta };
    });
}

export function startMailInbox(opts: { port?: number; dir?: string } = {}): Promise<Server> {
  const port = opts.port ?? Number(process.env.DEV_MAIL_UI_PORT ?? 8025);
  const dir = path.resolve(opts.dir ?? ".dev-mail");
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const send = (status: number, html: string, type = "text/html; charset=utf-8") => {
      res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff" });
      res.end(html);
    };
    if (req.method === "POST" && url.pathname === "/clear") {
      for (const f of existsSync(dir) ? readdirSync(dir) : []) if (/\.(eml|json)$/.test(f)) rmSync(path.join(dir, f));
      res.writeHead(303, { Location: "/" });
      return res.end();
    }
    const m = /^\/(message|raw)\/([0-9]+-[0-9]+)$/.exec(url.pathname);
    if (m) {
      const file = path.join(dir, `${m[2]}.eml`);
      if (!existsSync(file)) return send(404, page("Not found", "<p>Message not found.</p>"));
      const raw = readFileSync(file, "utf8");
      if (m[1] === "raw") return send(200, raw, "text/plain; charset=utf-8");
      const msg = parseMessage(raw);
      return send(
        200,
        page(
          msg.subject,
          `<div class="meta"><div><strong>Subject:</strong> ${esc(msg.subject)}</div><div><strong>From:</strong> ${esc(msg.from)}</div><div><strong>To:</strong> ${esc(msg.to)}</div><div><strong>Date:</strong> ${esc(msg.date)}</div><div><a href="/raw/${m[2]}">View raw message</a></div></div><pre>${linkify(msg.text)}</pre>`,
        ),
      );
    }
    if (url.pathname !== "/") return send(404, page("Not found", "<p>Not found.</p>"));
    const items = listMessages(dir);
    const rows = items
      .map(
        (i) =>
          `<tr><td>${esc(new Date(i.receivedAt).toLocaleString())}</td><td>${esc(i.to.join(", "))}</td><td><a href="/message/${i.id}">${esc(i.subject || "(no subject)")}</a></td></tr>`,
      )
      .join("");
    return send(
      200,
      page(
        "Local test inbox",
        `<p>${items.length} message${items.length === 1 ? "" : "s"} · this page refreshes every 5 seconds.</p>
${items.length ? `<table><thead><tr><th>Received</th><th>To</th><th>Subject</th></tr></thead><tbody>${rows}</tbody></table>
<form method="post" action="/clear" style="margin-top:16px"><button type="submit">Delete all test messages</button></form>` : "<p>No messages yet. Trigger an email in the app (for example, submit an application or use “Forgot your password?”).</p>"}`,
        true,
      ),
    );
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/** Starts both, tolerating "already running" (another process holds the ports). */
export async function startLocalMail(opts: { smtpPort?: number; uiPort?: number; dir?: string; quiet?: boolean } = {}) {
  const smtpPort = opts.smtpPort ?? Number(process.env.DEV_MAIL_PORT ?? 2525);
  const uiPort = opts.uiPort ?? Number(process.env.DEV_MAIL_UI_PORT ?? 8025);
  const result = { smtp: "started" as "started" | "already-running", inbox: "started" as "started" | "already-running" };
  await startDevMail({ port: smtpPort, dir: opts.dir, quiet: opts.quiet }).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "EADDRINUSE") throw e;
    result.smtp = "already-running";
  });
  await startMailInbox({ port: uiPort, dir: opts.dir }).catch((e: NodeJS.ErrnoException) => {
    if (e.code !== "EADDRINUSE") throw e;
    result.inbox = "already-running";
  });
  return { ...result, smtpPort, uiUrl: `http://127.0.0.1:${uiPort}` };
}

if (process.argv[1] && path.resolve(process.argv[1]).includes(`scripts${path.sep}dev-mail`)) {
  void startLocalMail({ dir: process.env.DEV_MAIL_DIR || undefined }).then((r) => {
    console.log(`Local test mail server: SMTP 127.0.0.1:${r.smtpPort} (${r.smtp}), inbox ${r.uiUrl} (${r.inbox}).`);
    console.log("Captured emails are NOT delivered to real inboxes. Press Ctrl+C to stop.");
  });
}
