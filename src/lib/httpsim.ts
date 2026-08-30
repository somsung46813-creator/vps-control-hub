// Simulated HTTP engine for the guest's Firefox window.
// Produces a realistic request/response exchange plus a renderable page body.

export type HttpHeader = { name: string; value: string };

export type HttpExchange = {
  url: string;
  scheme: string;
  host: string;
  path: string;
  method: string;
  status: number;
  statusText: string;
  protocol: string;
  remote: string;
  tls: string;
  ttfbMs: number;
  totalMs: number;
  bytes: number;
  requestHeaders: HttpHeader[];
  responseHeaders: HttpHeader[];
  title: string;
  heading: string;
  lines: string[];
  links: { label: string; href: string }[];
};

const UA =
  "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** Turn raw omnibox input into a URL (Google search when it is not URL-ish). */
export function searchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

export function normalizeUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return "about:blank";
  if (/^(about|file|view-source):/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) return raw;
  const looksHost = /^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(raw);
  if (looksHost) return `https://${raw}`;
  return searchUrl(raw);
}

type PageSeed = {
  title: string;
  heading: string;
  lines: string[];
  links: { label: string; href: string }[];
  contentType?: string;
};

function pageFor(url: string, host: string, path: string): PageSeed {
  if (url.startsWith("about:blank")) {
    return { title: "New Tab", heading: "about:blank", lines: [], links: [] };
  }
  if (url.startsWith("file://")) {
    const name = url.split("/").filter(Boolean).pop() ?? "file";
    return {
      title: name,
      heading: `Index of ${url.replace("file://", "")}`,
      lines: [
        "drwxr-xr-x  ubuntu ubuntu   4096  .",
        "drwxr-xr-x  root   root     4096  ..",
        `-rw-r--r--  ubuntu ubuntu   1024  ${name}`,
      ],
      links: [],
      contentType: "text/html; charset=UTF-8",
    };
  }
  if (host.includes("duckduckgo") && path.includes("q=")) {
    const q = decodeURIComponent(path.split("q=")[1] ?? "").replace(/\+/g, " ");
    return {
      title: `${q} at DuckDuckGo`,
      heading: `Results for “${q}”`,
      lines: [
        `About ${(hash(q) % 900000) + 12000} results (0.${(hash(q) % 89) + 10} seconds)`,
      ],
      links: [
        { label: `${q} — Wikipedia`, href: `https://en.wikipedia.org/wiki/${encodeURIComponent(q)}` },
        { label: `${q} documentation`, href: `https://docs.${(q.split(" ")[0] || "web").toLowerCase()}.org/` },
        { label: `Ask Ubuntu: ${q}`, href: `https://askubuntu.com/search?q=${encodeURIComponent(q)}` },
      ],
    };
  }
  if (host.includes("mozilla")) {
    return {
      title: "Firefox Start Page",
      heading: "Search the web privately",
      lines: [
        "Firefox 128.0 · snap package · profile /home/ubuntu/snap/firefox",
        "Enhanced Tracking Protection: Standard · 0 trackers blocked this session",
      ],
      links: [
        { label: "Ubuntu documentation", href: "https://help.ubuntu.com/" },
        { label: "Mozilla support", href: "https://support.mozilla.org/" },
        { label: "DuckDuckGo", href: "https://duckduckgo.com/?q=xfce" },
      ],
    };
  }
  if (host.includes("ubuntu") || host.includes("askubuntu")) {
    return {
      title: `${host} — Ubuntu`,
      heading: `${host}${path}`,
      lines: [
        "Official Ubuntu documentation mirror (noble 24.04 LTS)",
        "Sections: installation · desktop · server · packaging · virtualization",
      ],
      links: [
        { label: "VirtualBox guest additions", href: "https://help.ubuntu.com/community/VirtualBox/GuestAdditions" },
        { label: "Xfce desktop", href: "https://help.ubuntu.com/community/Xfce" },
      ],
    };
  }
  return {
    title: host,
    heading: `${host}${path === "/" ? "" : path}`,
    lines: [
      `Served by ${host} · document rendered by Gecko 128`,
      "This page was fetched over the guest's virtual NAT interface (enp0s3).",
    ],
    links: [
      { label: `${host} — home`, href: `https://${host}/` },
      { label: `${host} — about`, href: `https://${host}/about` },
    ],
  };
}

/** Build a full simulated request/response exchange for a URL. */
export function simulateHttp(rawUrl: string, method = "GET"): HttpExchange {
  const url = normalizeUrl(rawUrl);
  const m = /^([a-z]+):\/\/([^/?#]*)([^#]*)?/i.exec(url);
  const scheme = (m?.[1] ?? "about").toLowerCase();
  const host = m?.[2] ?? "";
  const path = m?.[3] || "/";
  const seed = hash(url);
  const page = pageFor(url, host, path);

  const notFound = /\/(404|missing|nope)(\/|$)/.test(path);
  const status = notFound ? 404 : 200;
  const statusText = notFound ? "Not Found" : "OK";
  const bytes = 1400 + (seed % 48000);
  const ttfbMs = 24 + (seed % 180);
  const totalMs = ttfbMs + 40 + (seed % 320);
  const local = scheme === "file" || scheme === "about";

  const requestHeaders: HttpHeader[] = local
    ? [{ name: "Method", value: `${method} ${url}` }]
    : [
        { name: "Host", value: host },
        { name: "User-Agent", value: UA },
        { name: "Accept", value: "text/html,application/xhtml+xml,*/*;q=0.8" },
        { name: "Accept-Language", value: "en-US,en;q=0.5" },
        { name: "Accept-Encoding", value: "gzip, deflate, br" },
        { name: "Connection", value: "keep-alive" },
        { name: "Upgrade-Insecure-Requests", value: "1" },
        { name: "Sec-Fetch-Mode", value: "navigate" },
      ];

  const responseHeaders: HttpHeader[] = local
    ? [{ name: "Content-Type", value: page.contentType ?? "text/html" }]
    : [
        { name: "content-type", value: page.contentType ?? "text/html; charset=UTF-8" },
        { name: "content-length", value: String(bytes) },
        { name: "content-encoding", value: "br" },
        { name: "server", value: seed % 2 ? "nginx/1.24.0 (Ubuntu)" : "cloudflare" },
        { name: "cache-control", value: "max-age=0, must-revalidate" },
        { name: "strict-transport-security", value: "max-age=63072000" },
        { name: "x-content-type-options", value: "nosniff" },
        { name: "date", value: new Date().toUTCString() },
      ];

  return {
    url,
    scheme,
    host,
    path,
    method,
    status,
    statusText,
    protocol: local ? "local" : seed % 3 === 0 ? "HTTP/2" : "HTTP/3",
    remote: local ? "—" : `${(seed % 200) + 20}.${(seed >> 3) % 255}.${(seed >> 7) % 255}.${(seed >> 11) % 255}:443`,
    tls: local ? "none" : "TLS 1.3 · TLS_AES_128_GCM_SHA256",
    ttfbMs,
    totalMs,
    bytes,
    requestHeaders,
    responseHeaders,
    title: notFound ? "404 Not Found" : page.title,
    heading: notFound ? "404 — page not found" : page.heading,
    lines: notFound ? [`The requested URL ${path} was not found on ${host}.`] : page.lines,
    links: notFound ? [] : page.links,
  };
}
