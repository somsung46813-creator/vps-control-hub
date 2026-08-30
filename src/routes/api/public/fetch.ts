import { createFileRoute } from "@tanstack/react-router";

const MAX_BYTES = 2_000_000;

function isBlockedHost(host: string) {
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^169\.254\./.test(h)) return true;
  return false;
}

function sanitize(html: string, baseUrl: string) {
  let out = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object\b[\s\S]*?<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  const base = `<base href="${baseUrl.replace(/"/g, "&quot;")}">`;
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head([^>]*)>/i, `<head$1>${base}`);
  else out = `${base}${out}`;
  return out;
}

function textAndLinks(html: string, baseUrl: string) {
  const links: { label: string; href: string }[] = [];
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && links.length < 40) {
    const label = m[2]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!label) continue;
    try {
      links.push({ label: label.slice(0, 90), href: new URL(m[1]!, baseUrl).toString() });
    } catch {
      /* skip bad href */
    }
  }
  const body = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  const lines: string[] = [];
  for (let i = 0; i < body.length && lines.length < 24; i += 160) lines.push(body.slice(i, i + 160));
  return { links, lines };
}

type FetchPayload = {
  ok: true;
  url: string;
  status: number;
  statusText: string;
  contentType: string;
  bytes: number;
  ttfbMs: number;
  totalMs: number;
  title: string;
  responseHeaders: { name: string; value: string }[];
  html: string | null;
  lines: string[];
  links: { label: string; href: string }[];
  via: string;
};

/** Search-engine fallback chain — Google frequently refuses proxied clients. */
function searchCandidates(u: URL): string[] {
  const q = u.searchParams.get("q");
  const isSearch = /(^|\.)(google|bing|duckduckgo)\./i.test(u.hostname) && !!q;
  if (!isSearch || !q) return [u.toString()];
  const enc = encodeURIComponent(q);
  return [
    u.toString(),
    `https://html.duckduckgo.com/html/?q=${enc}`,
    `https://lite.duckduckgo.com/lite/?q=${enc}`,
    `https://www.bing.com/search?q=${enc}`,
  ];
}

async function fetchOnce(target: string, t0: number): Promise<FetchPayload> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12_000);
  try {
    const res = await fetch(target, {
      redirect: "follow",
      signal: ctl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });
    const ttfbMs = Date.now() - t0;
    const ctype = res.headers.get("content-type") ?? "";
    const raw = await res.text();
    const body = raw.slice(0, MAX_BYTES);
    const totalMs = Date.now() - t0;
    const isHtml = ctype.includes("html") || /^\s*<(!doctype|html)/i.test(body);
    const finalUrl = res.url || target;
    const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1] ?? "").trim() || new URL(finalUrl).host;
    const parsed = isHtml
      ? textAndLinks(body, finalUrl)
      : { links: [], lines: [body.slice(0, 4000)] };

    if (res.status >= 400) {
      throw new Error(`upstream ${res.status} ${res.statusText || ""}`.trim());
    }

    return {
      ok: true,
      url: finalUrl,
      status: res.status,
      statusText: res.statusText || "",
      contentType: ctype,
      bytes: body.length,
      ttfbMs,
      totalMs,
      title,
      responseHeaders: [...res.headers.entries()].map(([name, value]) => ({ name, value })),
      html: isHtml ? sanitize(body, finalUrl) : null,
      lines: parsed.lines,
      links: parsed.links,
      via: new URL(finalUrl).host,
    };
  } finally {
    clearTimeout(timer);
  }
}

function resolutionsFor(message: string, host: string): string[] {
  const m = message.toLowerCase();
  const tips: string[] = [];
  if (m.includes("aborted") || m.includes("timeout"))
    tips.push("Upstream timed out after 12s — retry, or open the site directly by URL.");
  if (m.includes("429") || m.includes("403") || m.includes("captcha"))
    tips.push(`${host} refused the proxied request (bot check) — try a different search engine or a direct URL.`);
  if (m.includes("enotfound") || m.includes("dns") || m.includes("getaddrinfo"))
    tips.push("DNS lookup failed — check the hostname spelling.");
  if (m.includes("certificate") || m.includes("tls") || m.includes("ssl"))
    tips.push("TLS handshake failed — the site's certificate could not be validated.");
  if (!tips.length) tips.push("The guest NAT proxy could not reach the origin — retry the request.");
  tips.push("Falling back to the cached offline render of this page.");
  return tips;
}

export const Route = createFileRoute("/api/public/fetch")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const target = new URL(request.url).searchParams.get("url") ?? "";
        let u: URL;
        try {
          u = new URL(target);
        } catch {
          return Response.json(
            { error: "invalid url", resolutions: ["Enter a full address such as https://example.com"] },
            { status: 400 },
          );
        }
        if (u.protocol !== "http:" && u.protocol !== "https:")
          return Response.json(
            { error: "unsupported scheme", resolutions: ["Only http:// and https:// can be proxied."] },
            { status: 400 },
          );
        if (isBlockedHost(u.hostname))
          return Response.json(
            { error: "blocked host", resolutions: ["Private/loopback addresses are not reachable from the guest NAT."] },
            { status: 403 },
          );

        const t0 = Date.now();
        const attempts: string[] = [];
        for (const candidate of searchCandidates(u)) {
          try {
            const payload = await fetchOnce(candidate, t0);
            return Response.json(
              { ...payload, attempts },
              { headers: { "cache-control": "no-store" } },
            );
          } catch (err) {
            const message = err instanceof Error ? err.message : "fetch failed";
            attempts.push(`${new URL(candidate).host}: ${message}`);
          }
        }

        const last = attempts[attempts.length - 1] ?? "fetch failed";
        return Response.json(
          {
            error: last,
            attempts,
            resolutions: resolutionsFor(last, u.host),
            totalMs: Date.now() - t0,
          },
          { status: 502 },
        );
      },
    },
  },
});
