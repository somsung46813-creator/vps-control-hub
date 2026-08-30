import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeUrl, simulateHttp, type HttpExchange } from "@/lib/httpsim";

const FOX_HOME = "https://start.mozilla.org";
import type { Guest } from "@/lib/guests";
import { guestConn } from "@/lib/guestshell";
import {
  attachLine,
  CLASS_ICON,
  detachLine,
  ioDevices,
  type IoDevice,
} from "@/lib/iobus";

type CLIP_MODE = "bidirectional" | "host-to-guest" | "guest-to-host" | "disabled";

const CLIP_MODES: Array<{ id: CLIP_MODE; label: string }> = [
  { id: "bidirectional", label: "bidi" },
  { id: "host-to-guest", label: "host→guest" },
  { id: "guest-to-host", label: "guest→host" },
  { id: "disabled", label: "off" },
];

type Props = {

  guest: Guest;
  hostIp: string;
  onClose: () => void;
  onBusEvent?: (line: string) => void;
};

const HANDSHAKE = [
  "resolving VRDE endpoint",
  "RDP negotiation · TLS + NLA requested",
  "protocol: RDP 10.11 · credSSP channel up",
  "channel join: rdpdr rdpsnd cliprdr",
  "graphics: AVC444 pipeline negotiated",
  "usb bus enumerate · bdf map exported",
  "desktop session resumed · XFCE",
];

const DESKTOP_ICONS: Array<{
  label: string;
  glyph: string;
  path: string;
  entries: string[];
}> = [
  {
    label: "Home",
    glyph: "📁",
    path: "/home/ubuntu",
    entries: ["Desktop/", "Documents/", "Downloads/", ".xinitrc", ".bashrc"],
  },
  {
    label: "File System",
    glyph: "📁",
    path: "/",
    entries: ["bin/", "etc/", "home/", "var/", "usr/"],
  },
  { label: "Trash", glyph: "🗑", path: "trash:///", entries: [] },
  {
    label: "Firefox",
    glyph: "🦊",
    path: "/usr/lib/firefox/firefox",
    entries: ["firefox", "firefox-bin", "omni.ja", "browser/", "defaults/"],
  },
];

export function RemoteDesktop({ guest, hostIp, onClose, onBusEvent }: Props) {
  const conn = guestConn(guest, hostIp);
  const [phase, setPhase] = useState(0); // handshake progress
  const [done, setDone] = useState(false);
  const [cursor, setCursor] = useState({ x: 62, y: 55 });
  const [devices, setDevices] = useState<IoDevice[]>(() => ioDevices(guest));
  const [typed, setTyped] = useState("");
  const [termLines, setTermLines] = useState<string[]>([]);
  const [cutIcon, setCutIcon] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; label: string | null } | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [openWin, setOpenWin] = useState<string | null>(null);
  const [foxWin, setFoxWin] = useState(false);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(DESKTOP_ICONS.map((i, n) => [i.label, { x: 7, y: 18 + n * 18 }])),
  );
  const [winPos, setWinPos] = useState<Record<string, { x: number; y: number }>>({
    thunar: { x: 56, y: 18 },
    term: { x: 26, y: 24 },
    firefox: { x: 20, y: 12 },
  });
  const [topWin, setTopWin] = useState<string>("thunar");
  const [winState, setWinState] = useState<Record<string, "normal" | "min" | "max">>({
    thunar: "normal",
    term: "normal",
    firefox: "normal",
  });
  const [focusFollow, setFocusFollow] = useState(true);
  const [termSel, setTermSel] = useState<string | null>(null);

  const [winSize, setWinSize] = useState<Record<string, { w: number; h: number }>>({});
  const [resize, setResize] = useState<{
    label: string;
    edge: string;
    x0: number;
    y0: number;
    w0: number;
    h0: number;
    px0: number;
    py0: number;
    moved: boolean;
  } | null>(null);

  const [drag, setDrag] = useState<{
    kind: "icon" | "window";
    label: string;
    dx: number;
    dy: number;
    moved: boolean;
  } | null>(null);
  const [overTrash, setOverTrash] = useState(false);
  const [overFox, setOverFox] = useState(false);

  const [foxTab, setFoxTab] = useState(FOX_HOME);
  const [foxHist, setFoxHist] = useState<string[]>([FOX_HOME]);
  const [foxIdx, setFoxIdx] = useState(0);
  const [foxUrlInput, setFoxUrlInput] = useState(FOX_HOME);
  const [foxLoading, setFoxLoading] = useState(false);
  const [foxResp, setFoxResp] = useState<HttpExchange | null>(null);
  const [httpView, setHttpView] = useState(false);
  const [foxHtml, setFoxHtml] = useState<string | null>(null);
  const [foxLive, setFoxLive] = useState(false);
  const [foxReload, setFoxReload] = useState(0);


  const [trashed, setTrashed] = useState<string[]>([]);
  const dragMovedRef = useRef(false);
  const [busLog, setBusLog] = useState<string[]>([]);
  const [grabbed, setGrabbed] = useState(true);
  const [clipMode, setClipMode] = useState<CLIP_MODE>("bidirectional");
  const [clipGuest, setClipGuest] = useState("");
  const [clipXfer, setClipXfer] = useState<string | null>(null);
  const [busOpen, setBusOpen] = useState(true);
  const frameRef = useRef<HTMLDivElement | null>(null);


  const mouse = devices.find((d) => d.cls === "mouse")!;
  const keyboard = devices.find((d) => d.cls === "keyboard")!;

  // input only reaches the guest when the device is attached AND the viewer holds the grab
  const mouseLive = mouse.attached && grabbed;
  const keyboardLive = keyboard.attached && grabbed;

  const emit = useCallback(
    (line: string) => {
      setBusLog((prev) => [...prev, line].slice(-3));
      onBusEvent?.(line);
    },
    [onBusEvent],
  );

  useEffect(() => {
    if (phase >= HANDSHAKE.length) {
      const t = setTimeout(() => setDone(true), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPhase((p) => p + 1), 380);
    return () => clearTimeout(t);
  }, [phase]);

  // Escape always releases the grab back to the local desktop
  useEffect(() => {
    if (!done || !grabbed) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setGrabbed(false);
        emit("input grab released → host (Escape)");
      }
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [done, grabbed, emit]);

  // keyboard passthrough — only while the viewer holds the input grab
  useEffect(() => {
    if (!done || !keyboardLive) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return;
      // let the browser deliver cut/copy/paste events to the cliprdr handlers
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      if (e.key === "Backspace") setTyped((t) => t.slice(0, -1));
      else if (e.key === "Enter") runCommand();
      else if (e.key.length === 1) setTyped((t) => (t + e.key).slice(-48));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });


  // cliprdr — client clipboard streamed into the guest on paste (Ctrl/Cmd+V)
  const hostToGuest = clipMode === "bidirectional" || clipMode === "host-to-guest";
  const guestToHost = clipMode === "bidirectional" || clipMode === "guest-to-host";

  useEffect(() => {
    if (!done || !grabbed || !hostToGuest) return;
    function onPaste(e: ClipboardEvent) {
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      e.preventDefault();
      const flat = text.replace(/\s+/g, " ").trim();
      setTyped((t) => (t + flat).slice(-48));
      setClipGuest(flat);
      setClipXfer(`host → guest · ${new Blob([text]).size} B · CF_UNICODETEXT`);
      emit(
        `cliprdr: format data response · ${new Blob([text]).size} bytes CF_UNICODETEXT → ${guest.name}`,
      );
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [done, grabbed, hostToGuest, emit, guest.name]);

  async function copyFromGuest() {
    const payload = typed || clipGuest;
    if (!payload || !guestToHost) return;
    try {
      await navigator.clipboard.writeText(payload);
      setClipXfer(`guest → host · ${new Blob([payload]).size} B · UTF8_STRING`);
      emit(`cliprdr: format list · UTF8_STRING ${new Blob([payload]).size} bytes → host clipboard`);
    } catch {
      setClipXfer("guest → host · blocked by browser permission");
      emit("cliprdr: host clipboard write denied — permission");
    }
  }

  function cycleClipMode() {
    const i = CLIP_MODES.findIndex((m) => m.id === clipMode);
    const next = CLIP_MODES[(i + 1) % CLIP_MODES.length]!;
    setClipMode(next.id);
    emit(`cliprdr: channel mode ${next.id}`);
  }

  // ── guest shell: run whatever is on the prompt line ──────────────────────
  function runCommand() {
    const cmd = typed.trim();
    setTyped("");
    if (!cmd) {
      setTermLines((l) => [...l, `ubuntu@${guest.name}:~$`].slice(-9));
      return;
    }
    const out: string[] = [`ubuntu@${guest.name}:~$ ${cmd}`];
    const snap = cmd.match(/^sudo\s+snap\s+install\s+(\S+)/);
    const apt = cmd.match(/^sudo\s+apt(?:-get)?\s+install\s+(?:-y\s+)?(\S+)/);
    if (snap) {
      out.push(`Download snap "${snap[1]}" (4021) from Snap Store`, `${snap[1]} 128.0 from Mozilla✓ installed`);
      emit(`snapd: ${snap[1]} installed in ${guest.name}`);
    } else if (apt) {
      out.push(`Reading package lists... Done`, `Setting up ${apt[1]} ...`, `Processing triggers for desktop-file-utils ...`);
      emit(`dpkg: ${apt[1]} configured in ${guest.name}`);
    } else if (cmd === "clear") {
      setTermLines([]);
      return;
    } else if (cmd.startsWith("echo ")) {
      out.push(cmd.slice(5));
    } else if (cmd === "pwd") {
      out.push("/home/ubuntu");
    } else if (cmd === "ls") {
      out.push("Desktop  Documents  Downloads  Pictures  .xinitrc");
    } else {
      out.push(`${cmd.split(" ")[0]}: command executed`);
    }
    setTermLines((l) => [...l, ...out].slice(-9));
  }

  // ── cut / copy from the remote desktop into the cliprdr channel ──────────
  function clipPayload(label: string | null) {
    if (label) return DESKTOP_ICONS.find((i) => i.label === label)?.path ?? label;
    return termSel || typed || clipGuest;
  }

  // xfwm4 focus-follows-mouse — hovering a window raises/focuses it
  function hoverFocus(win: string) {
    if (!focusFollow || !mouseLive || topWin === win) return;
    setTopWin(win);
    emit(`xfwm4: focus follows mouse · ${win} activated (pointer ${mouse.bdf})`);
  }

  // select a line of terminal scrollback with the pointer (PRIMARY selection)
  function selectTermLine(line: string) {
    if (!mouseLive) return;
    setTermSel(line);
    setClipGuest(line);
    setClipXfer(`primary selection · ${new Blob([line]).size} B · UTF8_STRING`);
    emit(`cliprdr: PRIMARY selection · ${line.slice(0, 40)}`);
  }


  async function copyToChannel(label: string | null, cut = false) {
    const payload = clipPayload(label);
    if (!payload) return;
    setClipGuest(payload);
    const bytes = new Blob([payload]).size;
    if (guestToHost) {
      try {
        await navigator.clipboard.writeText(payload);
      } catch {
        /* host clipboard may be permission-gated; channel still holds the data */
      }
    }
    if (cut && label) {
      setCutIcon(label);
      emit(`cliprdr: cut · ${payload} (${bytes} B) staged on channel`);
    } else {
      emit(`cliprdr: copy · ${payload} (${bytes} B) → clipboard channel${guestToHost ? " + host" : ""}`);
    }
    setClipXfer(`${cut ? "cut" : "copy"} · ${bytes} B · UTF8_STRING`);
    setMenu(null);
  }

  function pasteToTerminal() {
    const payload = clipGuest;
    if (!payload) return;
    setTyped((t) => (t + payload).slice(-48));
    setTopWin("term");
    setClipXfer(`paste → terminal · ${new Blob([payload]).size} B`);
    emit(`cliprdr: paste · ${payload} → ubuntu@${guest.name} prompt`);
    if (cutIcon) {
      setTrashed((prev) => (prev.includes(cutIcon) ? prev : [...prev, cutIcon]));
      setCutIcon(null);
    }
    setMenu(null);
  }

  // desktop-side cut/copy shortcuts (Ctrl+C / Ctrl+X) while the grab is held
  useEffect(() => {
    if (!done || !keyboardLive) return;
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "c") void copyToChannel(selected);
      else if (e.key === "x") void copyToChannel(selected, true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });



  function toggleGrab() {
    if (grabbed) {
      emit("input grab released → host desktop (mouse + kbd local)");
      setGrabbed(false);
      return;
    }
    // grabbing is meaningless unless the HID endpoints are bound on the bus —
    // rebind any detached mouse/keyboard so the grab actually reaches the guest
    const rebind = devices.filter(
      (d) => (d.cls === "mouse" || d.cls === "keyboard") && !d.attached,
    );
    if (rebind.length) {
      setDevices((prev) =>
        prev.map((x) =>
          x.cls === "mouse" || x.cls === "keyboard" ? { ...x, attached: true } : x,
        ),
      );
      for (const d of rebind) emit(attachLine({ ...d, attached: true }, guest));
    }
    emit(
      `input grabbed → ${guest.name} (mouse ${mouse.bdf} + kbd ${keyboard.bdf} captured · Esc releases)`,
    );
    setGrabbed(true);
  }

  function toggleDevice(d: IoDevice) {
    setDevices((prev) =>
      prev.map((x) => (x.id === d.id ? { ...x, attached: !x.attached } : x)),
    );
    emit(d.attached ? detachLine(d, guest) : attachLine({ ...d, attached: true }, guest));
    // pulling both HID endpoints off the bus drops the grab back to the host
    if (d.attached && (d.cls === "mouse" || d.cls === "keyboard")) {
      const other = d.cls === "mouse" ? keyboard : mouse;
      if (grabbed && !other.attached) {
        setGrabbed(false);
        emit("input grab released → host (no HID endpoints bound)");
      }
    }
  }

  /** navigate the browser to a url (pushes session history) */
  function goFox(raw: string) {
    const url = normalizeUrl(raw);
    setFoxHist((h) => [...h.slice(0, foxIdx + 1), url]);
    setFoxIdx((i) => i + 1);
    setFoxTab(url);
    setFoxUrlInput(url);
  }

  function foxBack() {
    if (foxIdx <= 0) return;
    const url = foxHist[foxIdx - 1]!;
    setFoxIdx(foxIdx - 1);
    setFoxTab(url);
    setFoxUrlInput(url);
    emit("firefox: session history back");
  }

  function foxForward() {
    if (foxIdx >= foxHist.length - 1) return;
    const url = foxHist[foxIdx + 1]!;
    setFoxIdx(foxIdx + 1);
    setFoxTab(url);
    setFoxUrlInput(url);
    emit("firefox: session history forward");
  }

  // network engine — real fetch through the host VM proxy, sim fallback
  useEffect(() => {
    if (!foxWin) return;
    let alive = true;
    setFoxLoading(true);
    setFoxHtml(null);
    setFoxLive(false);
    const ex = simulateHttp(foxTab);
    emit(`firefox: ${ex.method} ${ex.url} · via enp0s3 NAT proxy`);

    const local = ex.scheme === "about" || ex.scheme === "file";
    if (local) {
      const t = setTimeout(() => {
        if (!alive) return;
        setFoxResp(ex);
        setFoxLoading(false);
        emit(`firefox: ${ex.status} ${ex.statusText} · ${ex.bytes} B (local)`);
      }, 180);
      return () => {
        alive = false;
        clearTimeout(t);
      };
    }

    (async () => {
      try {
        const r = await fetch(`/api/public/fetch?url=${encodeURIComponent(ex.url)}`);
        const j = (await r.json()) as Record<string, unknown>;
        if (!alive) return;
        if (!r.ok || j['ok'] !== true) throw new Error(String(j['error'] ?? r.status));
        const live: HttpExchange = {
          ...ex,
          url: String(j['url']),
          status: Number(j['status']),
          statusText: String(j['statusText'] || ""),
          ttfbMs: Number(j['ttfbMs']),
          totalMs: Number(j['totalMs']),
          bytes: Number(j['bytes']),
          title: String(j['title'] || ex.title),
          heading: String(j['title'] || ex.heading),
          lines: (j['lines'] as string[]) ?? [],
          links: (j['links'] as { label: string; href: string }[]) ?? [],
          responseHeaders: (j['responseHeaders'] as { name: string; value: string }[]) ?? [],
        };
        setFoxResp(live);
        setFoxHtml((j['html'] as string | null) ?? null);
        setFoxLive(true);
        setFoxLoading(false);
        emit(
          `firefox: ${live.status} ${live.statusText} · ${live.bytes} B · ttfb ${live.ttfbMs}ms · live`,
        );
      } catch (err) {
        if (!alive) return;
        setFoxResp(ex);
        setFoxLive(false);
        setFoxLoading(false);
        emit(
          `firefox: proxy unreachable (${err instanceof Error ? err.message : "error"}) — cached render`,
        );
      }
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foxTab, foxWin, foxReload]);


  function openIcon(label: string) {
    const icon = DESKTOP_ICONS.find((i) => i.label === label);
    if (!icon) return;
    setSelected(label);
    if (label === "Firefox") {
      emit(`firefox: launching ${icon.path} · pointer click via ${mouse.bdf}`);
      setFoxWin(true);
      setWinState((s) => ({ ...s, firefox: s['firefox'] === "max" ? "max" : "normal" }));
      setTopWin("firefox");
      setFoxReload((n) => n + 1);
      setTimeout(() => emit("firefox: process forked · pid 4821 · GPU compositing enabled"), 400);
      return;
    }
    setOpenWin(label);
    setWinState((s) => ({ ...s, thunar: s['thunar'] === "max" ? "max" : "normal" }));
    setTopWin("thunar");
    emit(`thunar: open ${icon.path} · pointer click via ${mouse.bdf}`);
  }

  function move(e: React.MouseEvent) {
    const el = frameRef.current;
    if (!el || !mouseLive) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setCursor({ x: Math.round(x), y: Math.round(y) });

    if (resize) {
      const dx = x - resize.x0;
      const dy = y - resize.y0;
      let w = resize.w0;
      let h = resize.h0;
      let px = resize.px0;
      let py = resize.py0;
      if (resize.edge.includes("e")) w = resize.w0 + dx;
      if (resize.edge.includes("s")) h = resize.h0 + dy;
      if (resize.edge.includes("w")) {
        w = resize.w0 - dx;
        px = resize.px0 + dx;
      }
      if (resize.edge.includes("n")) {
        h = resize.h0 - dy;
        py = resize.py0 + dy;
      }
      w = Math.max(18, Math.min(100, w));
      h = Math.max(14, Math.min(92, h));
      px = Math.max(0, Math.min(100 - w, px));
      py = Math.max(4.5, Math.min(96 - h, py));
      setWinSize((s) => ({ ...s, [resize.label]: { w, h } }));
      setWinPos((p) => ({ ...p, [resize.label]: { x: px, y: py } }));
      if (!resize.moved) {
        setResize({ ...resize, moved: true });
        emit(`xfwm4: resize begin · ${resize.label} (${resize.edge} grip via ${mouse.bdf})`);
      }
      return;
    }

    if (!drag) return;

    const isWin = drag.kind === "window";
    const nx = Math.min(isWin ? 74 : 94, Math.max(isWin ? 1 : 4, x - drag.dx));
    const ny = Math.min(isWin ? 74 : 90, Math.max(isWin ? 5 : 12, y - drag.dy));
    if (isWin) setWinPos((prev) => ({ ...prev, [drag.label]: { x: nx, y: ny } }));
    else setPos((prev) => ({ ...prev, [drag.label]: { x: nx, y: ny } }));
    if (!drag.moved) {
      dragMovedRef.current = true;
      setDrag({ ...drag, moved: true });
      emit(
        isWin
          ? `xfwm4: move window · ${drag.label} (motion via ${mouse.bdf})`
          : `xdnd: drag begin · ${drag.label} (motion via ${mouse.bdf})`,
      );
    }
    if (isWin) return;
    const bin = pos["Trash"];
    setOverTrash(
      drag.label !== "Trash" && bin != null && Math.abs(nx - bin.x) < 7 && Math.abs(ny - bin.y) < 9,
    );
    // firefox window is a drop target — hit-test cursor against its rect
    if (foxWin && ws("firefox") !== "min" && drag.label !== "Firefox") {
      const maxed = ws("firefox") === "max";
      const fp = maxed ? { x: 0, y: 4.5 } : wp("firefox");
      const w = maxed ? 100 : 46;
      const h = maxed ? 90 : 42;
      const hit = x >= fp.x && x <= fp.x + w && y >= fp.y && y <= fp.y + h;
      if (hit !== overFox) setOverFox(hit);
    } else if (overFox) {
      setOverFox(false);
    }
  }

  function wp(label: string) {
    return winPos[label] ?? { x: 30, y: 20 };
  }

  // ── xfwm4 window states: normal / minimized (iconified) / maximized ───────
  function ws(label: string) {
    return winState[label] ?? "normal";
  }

  function winStyle(label: string, width: string): React.CSSProperties {
    if (ws(label) === "max")
      return { left: "0%", top: "4.5%", width: "100%", height: "90%", overflow: "hidden" };
    const p = wp(label);
    const s = winSize[label];
    return {
      left: `${p.x}%`,
      top: `${p.y}%`,
      width: s ? `${s.w}%` : width,
      ...(s ? { height: `${s.h}%`, overflow: "hidden" } : {}),
    };
  }

  function startResize(e: React.MouseEvent, label: string, edge: string) {
    if (!mouseLive || ws(label) === "max") return;
    e.stopPropagation();
    e.preventDefault();
    const r = frameRef.current?.getBoundingClientRect();
    const el = (e.currentTarget as HTMLElement).parentElement;
    if (!r || !el) return;
    const b = el.getBoundingClientRect();
    setTopWin(label);
    const p = wp(label);
    setResize({
      label,
      edge,
      x0: ((e.clientX - r.left) / r.width) * 100,
      y0: ((e.clientY - r.top) / r.height) * 100,
      w0: (b.width / r.width) * 100,
      h0: (b.height / r.height) * 100,
      px0: p.x,
      py0: p.y,
      moved: false,
    });
  }

  function endResize() {
    if (!resize) return;
    if (resize.moved) {
      const s = winSize[resize.label];
      emit(
        `xfwm4: resize end · ${resize.label} → ${Math.round(s?.w ?? 0)}%×${Math.round(s?.h ?? 0)}% (configure notify)`,
      );
    }
    setResize(null);
  }

  /** 8-point xfwm4 resize grips: corners + sides. */
  function ResizeGrips({ label }: { label: string }) {
    if (ws(label) === "max") return null;
    const edges: Array<{ e: string; cls: string; cur: string }> = [
      { e: "n", cls: "left-2 right-2 top-0 h-1.5", cur: "ns-resize" },
      { e: "s", cls: "left-2 right-2 bottom-0 h-1.5", cur: "ns-resize" },
      { e: "w", cls: "top-2 bottom-2 left-0 w-1.5", cur: "ew-resize" },
      { e: "e", cls: "top-2 bottom-2 right-0 w-1.5", cur: "ew-resize" },
      { e: "nw", cls: "left-0 top-0 w-3 h-3", cur: "nwse-resize" },
      { e: "ne", cls: "right-0 top-0 w-3 h-3", cur: "nesw-resize" },
      { e: "sw", cls: "left-0 bottom-0 w-3 h-3", cur: "nesw-resize" },
      { e: "se", cls: "right-0 bottom-0 w-3 h-3", cur: "nwse-resize" },
    ];
    return (
      <>
        {edges.map((g) => (
          <div
            key={g.e}
            onMouseDown={(ev) => startResize(ev, label, g.e)}
            style={{ cursor: g.cur }}
            className={`absolute z-50 ${g.cls} ${
              resize?.label === label && resize.edge === g.e ? "bg-neon/40" : "hover:bg-neon/25"
            }`}
          />
        ))}
      </>
    );
  }


  function minimizeWin(label: string) {
    setWinState((s) => ({ ...s, [label]: "min" }));
    emit(`xfwm4: iconify · ${label} → taskbar (_NET_WM_STATE_HIDDEN)`);
  }

  function toggleMaximize(label: string) {
    const next = ws(label) === "max" ? "normal" : "max";
    setWinState((s) => ({ ...s, [label]: next }));
    setTopWin(label);
    emit(
      next === "max"
        ? `xfwm4: maximize · ${label} (_NET_WM_STATE_MAXIMIZED_VERT|HORZ)`
        : `xfwm4: unmaximize · ${label} restored to ${Math.round(wp(label).x)},${Math.round(wp(label).y)}`,
    );
  }

  function restoreWin(label: string) {
    if (ws(label) === "min") {
      setWinState((s) => ({ ...s, [label]: "normal" }));
      emit(`xfwm4: deiconify · ${label} restored from taskbar`);
    }
    setTopWin(label);
  }

  function startWindowDrag(e: React.MouseEvent, label: string) {
    if (!mouseLive) return;
    e.stopPropagation();
    e.preventDefault();
    setTopWin(label);
    if (ws(label) === "max") return; // maximized windows are pinned
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return;
    const p = winPos[label] ?? { x: 30, y: 20 };
    setDrag({
      kind: "window",
      label,
      dx: ((e.clientX - r.left) / r.width) * 100 - p.x,
      dy: ((e.clientY - r.top) / r.height) * 100 - p.y,
      moved: false,
    });
  }

  function endDrag() {
    if (!drag) return;
    const label = drag.label;
    if (drag.kind === "window") {
      if (drag.moved) {
        const p = winPos[label];
        emit(
          `xfwm4: window placed · ${label} @ ${Math.round(p?.x ?? 0)},${Math.round(p?.y ?? 0)}`,
        );
      }
    } else if (drag.moved && overTrash && label !== "Trash") {
      setTrashed((prev) => [...prev, label]);
      emit(`gio trash "${DESKTOP_ICONS.find((i) => i.label === label)?.path}" · ${label} → Trash`);
      setSelected(null);
    } else if (drag.moved && overFox && label !== "Firefox") {
      const path = DESKTOP_ICONS.find((i) => i.label === label)?.path ?? label;
      goFox(`file://${path}`);
      setTopWin("firefox");
      emit(`xdnd: drop ${label} → firefox window · new tab file://${path}`);
      setTimeout(() => emit(`firefox: rendering file://${path} · text/html decoded`), 400);
    } else if (drag.moved) {
      const p = pos[label];
      emit(`xdnd: drop ${label} @ ${Math.round(p?.x ?? 0)},${Math.round(p?.y ?? 0)} · icon position saved`);
    }
    setDrag(null);
    setOverTrash(false);
    setOverFox(false);
    // let the click that follows mouseup know it was a drag, not a selection
    setTimeout(() => {
      dragMovedRef.current = false;
    }, 0);
  }




  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm p-2 sm:p-4">
      <div className="w-full max-w-5xl max-h-[96vh] flex flex-col rounded-xl bg-panel ring-1 ring-railedge overflow-hidden shadow-2xl">

        {/* title bar */}
        <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-railedge">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full bg-destructive/70" />
            <span className="h-2 w-2 rounded-full bg-amber/70" />
            <span className="h-2 w-2 rounded-full bg-mint/70" />
            <p className="text-xs text-ink font-mono truncate ml-2">
              rdp://{conn.rdpTarget} — {guest.name}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-dim">
              {done ? "connected · TLS 1.3" : "handshaking…"}
            </span>
            <button
              onClick={toggleGrab}
              disabled={!done}
              aria-pressed={grabbed}
              aria-label={grabbed ? "Release input to local desktop" : "Grab mouse and keyboard input"}
              className={`text-[10px] px-2 py-1 rounded ring-1 font-mono transition disabled:opacity-40 ${
                grabbed
                  ? "text-neon ring-neon/50 bg-neon/10 hover:bg-neon/20"
                  : "text-amber ring-amber/50 bg-amber/10 hover:bg-amber/20"
              }`}
            >
              {grabbed ? "⤓ release input" : "⤒ grab input"}
            </button>
            <button
              onClick={onClose}
              aria-label="Close remote desktop"
              className="text-[10px] px-2 py-1 rounded ring-1 ring-railedge text-dim hover:text-destructive transition"
            >
              disconnect
            </button>
          </div>
        </div>

        <div
          className={`flex-1 min-h-0 overflow-y-auto grid grid-cols-1 ${
            busOpen ? "md:grid-cols-[1fr_16rem] xl:grid-cols-[1fr_18rem]" : "md:grid-cols-[1fr_2.25rem]"
          }`}
        >
        {/* display */}
        <div
          ref={frameRef}
          onMouseMove={move}
          onMouseUp={() => {
            endResize();
            endDrag();
          }}
          onMouseLeave={() => {
            endResize();
            endDrag();
          }}

          onContextMenu={(e) => {
            if (!mouseLive) return;
            e.preventDefault();
            const r = frameRef.current?.getBoundingClientRect();
            if (!r) return;
            setSelected(null);
            setMenu({
              x: ((e.clientX - r.left) / r.width) * 100,
              y: ((e.clientY - r.top) / r.height) * 100,
              label: null,
            });
          }}
          onClick={() => {
            setMenu(null);
            if (done && !grabbed) toggleGrab();
            else if (mouseLive) setSelected(null);
          }}

          className={`relative aspect-video bg-[#0a141f] overflow-hidden font-mono select-none ${
            mouseLive ? "cursor-none" : grabbed ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          {/* released-input overlay — click to re-grab */}
          {done && !grabbed && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-void/60 backdrop-blur-[2px]">
              <p className="text-sm font-mono text-amber">input released — local desktop has control</p>
              <p className="text-[11px] font-mono text-dim">
                click the display or press “grab input” to send mouse + keyboard to {guest.name}
              </p>
            </div>
          )}

          {!done ? (
            <div className="absolute inset-0 p-5 text-[11px] leading-5 text-mint/90">
              {HANDSHAKE.slice(0, phase).map((line) => (
                <p key={line}>
                  <span className="text-dim">vrde</span> {line} <span className="text-mint">ok</span>
                </p>
              ))}
              <p className="text-neon animate-pulse mt-1">▌</p>
            </div>
          ) : (
            <>
              {/* XFCE top panel */}
              <div className="absolute top-0 inset-x-0 h-7 bg-[#1b2b3d]/95 border-b border-black/50 flex items-center gap-3 px-2 text-[10px] text-[#c8d6e5]">
                <span className="px-1.5 py-0.5 rounded bg-[#2e4258] text-[#7ec8ff]">Applications</span>
                <span className="px-1.5 py-0.5 rounded hover:bg-[#2e4258]">Terminal Emulator</span>
                <span className="px-1.5 py-0.5 rounded hover:bg-[#2e4258]">Thunar</span>
                <span className="flex-1" />
                <span className="text-[#8fa8c0]">{guest.name} · ubuntu</span>
                <span className="text-mint">●</span>
              </div>
              {/* desktop icons — click to select, double click to open, drag to move / drop on Trash */}
              {DESKTOP_ICONS.filter((i) => !trashed.includes(i.label)).map((icon) => {
                const p = pos[icon.label] ?? { x: 3, y: 14 };
                const isDragging = drag?.label === icon.label;
                const isTarget =
                  drag != null && drag.label !== "Trash" && icon.label === "Trash" && overTrash;
                return (
                  <button
                    key={icon.label}
                    type="button"
                    disabled={!mouseLive}
                    style={{ left: `${p.x}%`, top: `${p.y}%` }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!mouseLive) return;
                      setSelected(icon.label);
                      const r = frameRef.current?.getBoundingClientRect();
                      if (!r) return;
                      setMenu({
                        x: ((e.clientX - r.left) / r.width) * 100,
                        y: ((e.clientY - r.top) / r.height) * 100,
                        label: icon.label,
                      });
                    }}

                    onMouseDown={(e) => {
                      if (!mouseLive) return;
                      e.stopPropagation();
                      e.preventDefault();
                      const r = frameRef.current?.getBoundingClientRect();
                      if (!r) return;
                      setDrag({
                        kind: "icon",

                        label: icon.label,
                        dx: ((e.clientX - r.left) / r.width) * 100 - p.x,
                        dy: ((e.clientY - r.top) / r.height) * 100 - p.y,
                        moved: false,
                      });
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dragMovedRef.current) return;
                      setSelected(icon.label);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      openIcon(icon.label);
                    }}
                    className={`absolute z-20 w-16 -ml-8 flex flex-col items-center gap-1 rounded px-1.5 py-1 text-center text-[9px] text-[#c8d6e5] transition-colors ${
                      mouseLive ? "cursor-none" : "cursor-default"
                    } ${isDragging ? "opacity-80 ring-1 ring-[#7ec8ff] bg-[#3d5a7a]/70" : ""} ${
                      isTarget ? "ring-1 ring-mint bg-mint/20" : ""
                    } ${
                      selected === icon.label && !isDragging
                        ? "bg-[#3d5a7a]/60 ring-1 ring-[#7ec8ff]"
                        : "hover:bg-[#2e4258]/60"
                    }`}
                  >
                    <span className="h-7 w-7 rounded-md bg-[#2e4258] ring-1 ring-[#3d5a7a] flex items-center justify-center text-[11px]">
                      {icon.glyph}
                    </span>
                    {icon.label}
                  </button>
                );
              })}



              {/* thunar window opened from a desktop icon */}
              {openWin && ws("thunar") !== "min" && (
                <div
                  style={winStyle("thunar", "38%")}
                  onMouseDown={() => setTopWin("thunar")}
                  onMouseEnter={() => hoverFocus("thunar")}

                  className={`absolute rounded-md bg-[#101d2b]/95 ring-1 ring-[#3d5a7a] shadow-2xl text-[10px] ${
                    topWin === "thunar" ? "z-40" : "z-30"
                  } ${drag?.kind === "window" && drag.label === "thunar" ? "opacity-90" : ""}`}
                >
                  <ResizeGrips label="thunar" />

                  <div
                    onMouseDown={(e) => startWindowDrag(e, "thunar")}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      toggleMaximize("thunar");
                    }}
                    className={`flex items-center gap-1.5 px-2 py-1 bg-[#22354a] rounded-t-md text-[#c8d6e5] select-none ${
                      mouseLive ? "cursor-none" : "cursor-default"
                    }`}
                  >

                    <button
                      type="button"
                      aria-label="Close window"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenWin(null);
                        emit(`thunar: window closed · ${openWin}`);
                      }}
                      className="h-2 w-2 rounded-full bg-destructive/80 hover:bg-destructive"
                    />
                    <button
                      type="button"
                      aria-label="Minimize window"
                      title="minimize"
                      onClick={(e) => {
                        e.stopPropagation();
                        minimizeWin("thunar");
                      }}
                      className="h-2 w-2 rounded-full bg-amber/70 hover:bg-amber"
                    />
                    <button
                      type="button"
                      aria-label="Maximize window"
                      title="maximize"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMaximize("thunar");
                      }}
                      className="h-2 w-2 rounded-full bg-mint/70 hover:bg-mint"
                    />
                    <span className="ml-1.5 truncate">
                      {openWin} — Thunar {DESKTOP_ICONS.find((i) => i.label === openWin)?.path}
                    </span>
                  </div>
                  <div className="p-2 leading-5 text-[#c8d6e5]">
                    {(openWin === "Trash"
                      ? trashed.map((t) => `${t}/`)
                      : (DESKTOP_ICONS.find((i) => i.label === openWin)?.entries ?? [])
                    ).map((f) => (
                      <p key={f} className="truncate">
                        <span className="text-[#7ec8ff]">{f.endsWith("/") ? "📁" : "📄"}</span> {f}
                      </p>
                    ))}
                    {openWin === "Trash" && trashed.length === 0 && (
                      <p className="text-[#8fa8c0]">Trash is empty — drag an icon onto it</p>
                    )}
                  </div>
                </div>
              )}
              {/* firefox browser window */}
              {foxWin && ws("firefox") !== "min" && (
                <div
                  style={winStyle("firefox", httpView ? "64%" : "46%")}
                  onMouseDown={() => setTopWin("firefox")}
                  onMouseEnter={() => hoverFocus("firefox")}
                  className={`absolute rounded-md bg-[#101d2b]/95 shadow-2xl text-[10px] ${
                    overFox ? "ring-2 ring-mint" : "ring-1 ring-[#3d5a7a]"
                  } ${
                    topWin === "firefox" ? "z-40" : "z-30"
                  } ${drag?.kind === "window" && drag.label === "firefox" ? "opacity-90" : ""}`}
                >
                  <div
                    onMouseDown={(e) => startWindowDrag(e, "firefox")}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      toggleMaximize("firefox");
                    }}
                    className={`flex items-center gap-1.5 px-2 py-1 bg-[#22354a] rounded-t-md text-[#c8d6e5] select-none ${
                      mouseLive ? "cursor-none" : "cursor-default"
                    }`}
                  >
                    <button
                      type="button"
                      aria-label="Close Firefox"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFoxWin(false);
                        emit("firefox: window closed · process exited code 0");
                      }}
                      className="h-2 w-2 rounded-full bg-destructive/80 hover:bg-destructive"
                    />
                    <button
                      type="button"
                      aria-label="Minimize Firefox"
                      title="minimize"
                      onClick={(e) => {
                        e.stopPropagation();
                        minimizeWin("firefox");
                      }}
                      className="h-2 w-2 rounded-full bg-amber/70 hover:bg-amber"
                    />
                    <button
                      type="button"
                      aria-label="Maximize Firefox"
                      title="maximize"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMaximize("firefox");
                      }}
                      className="h-2 w-2 rounded-full bg-mint/70 hover:bg-mint"
                    />
                    <span className="ml-1.5 truncate">
                      🦊 {foxLoading ? "Loading…" : foxResp?.title ?? "New Tab"} — Mozilla Firefox
                    </span>
                  </div>
                  {/* navigation toolbar */}
                  <div
                    className="flex items-center gap-1 px-2 py-1 border-b border-[#3d5a7a]/60"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      title="back"
                      disabled={foxIdx <= 0}
                      onClick={foxBack}
                      className="text-[#8fa8c0] px-1 disabled:opacity-30 hover:text-[#7ec8ff]"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      title="forward"
                      disabled={foxIdx >= foxHist.length - 1}
                      onClick={foxForward}
                      className="text-[#8fa8c0] px-1 disabled:opacity-30 hover:text-[#7ec8ff]"
                    >
                      →
                    </button>
                    <button
                      type="button"
                      title="reload"
                      onClick={() => setFoxReload((n) => n + 1)}
                      className="text-[#8fa8c0] px-1 hover:text-[#7ec8ff]"
                    >
                      ⟳
                    </button>
                    <button
                      type="button"
                      title="home"
                      onClick={() => goFox(FOX_HOME)}
                      className="text-[#8fa8c0] px-1 hover:text-[#7ec8ff]"
                    >
                      ⌂
                    </button>
                    <form
                      className="flex-1 min-w-0"
                      onSubmit={(e) => {
                        e.preventDefault();
                        goFox(foxUrlInput);
                      }}
                    >
                      <input
                        value={foxUrlInput}
                        onChange={(e) => setFoxUrlInput(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        spellCheck={false}
                        aria-label="Address bar"
                        placeholder="Search with DuckDuckGo or enter address"
                        className="w-full rounded bg-black/50 px-2 py-0.5 text-[#7ec8ff] outline-none ring-1 ring-transparent focus:ring-[#7ec8ff]/50"
                      />
                    </form>
                    <button
                      type="button"
                      title="toggle HTTP view (network inspector)"
                      onClick={() => setHttpView((v) => !v)}
                      className={`px-1.5 py-0.5 rounded ring-1 ${
                        httpView
                          ? "text-mint ring-mint/50 bg-mint/10"
                          : "text-[#8fa8c0] ring-[#3d5a7a] hover:text-[#7ec8ff]"
                      }`}
                    >
                      HTTP
                    </button>
                  </div>
                  {/* viewport */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] max-h-[52%]">
                    <div className="p-0 leading-5 text-[#c8d6e5] overflow-y-auto min-h-[220px]">
                      {foxLoading || !foxResp ? (
                        <p className="p-3 text-[#8fa8c0]">Connecting to {normalizeUrl(foxTab)}…</p>
                      ) : foxHtml ? (
                        <iframe
                          title={foxResp.title}
                          srcDoc={foxHtml}
                          sandbox=""
                          className="w-full h-[320px] bg-white"
                        />
                      ) : (
                        <div className="p-3">
                          <p className="text-[#7ec8ff] text-[11px] font-semibold">{foxResp.heading}</p>
                          {!foxLive && (
                            <p className="text-amber text-[9px]">
                              offline render — guest NAT proxy unreachable
                            </p>
                          )}
                          {foxResp.lines.map((l, i) => (
                            <p key={`${i}-${l.slice(0, 12)}`} className="text-[#8fa8c0]">{l}</p>
                          ))}
                          {foxResp.links.map((lk) => (
                            <button
                              key={lk.href}
                              type="button"
                              onClick={() => goFox(lk.href)}
                              className="block mt-1 text-left text-[#7ec8ff] underline underline-offset-2 hover:text-mint"
                            >
                              {lk.label}
                            </button>
                          ))}
                        </div>
                      )}

                    </div>
                    {httpView && (
                      <div className="md:w-56 border-t md:border-t-0 md:border-l border-[#3d5a7a]/60 p-2 overflow-y-auto text-[9px] leading-4">
                        <p className="text-[#8fa8c0] uppercase tracking-wider">network · headers</p>
                        {foxResp && !foxLoading ? (
                          <>
                            <p className={foxResp.status === 200 ? "text-mint" : "text-amber"}>
                              {foxResp.status} {foxResp.statusText} · {foxResp.protocol}
                            </p>
                            <p className="text-[#8fa8c0] truncate">{foxResp.remote}</p>
                            <p className="text-[#8fa8c0] truncate">{foxResp.tls}</p>
                            <p className="text-[#8fa8c0]">
                              ttfb {foxResp.ttfbMs}ms · total {foxResp.totalMs}ms · {foxResp.bytes} B
                            </p>
                            <p className="mt-1.5 text-[#7ec8ff]">▸ request</p>
                            {foxResp.requestHeaders.map((h) => (
                              <p key={h.name} className="text-[#8fa8c0] truncate">
                                <span className="text-[#c8d6e5]">{h.name}:</span> {h.value}
                              </p>
                            ))}
                            <p className="mt-1.5 text-[#7ec8ff]">▾ response</p>
                            {foxResp.responseHeaders.map((h) => (
                              <p key={h.name} className="text-[#8fa8c0] truncate">
                                <span className="text-[#c8d6e5]">{h.name}:</span> {h.value}
                              </p>
                            ))}
                          </>
                        ) : (
                          <p className="text-[#8fa8c0]">waiting for response…</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {/* terminal window */}
              <div
                style={winStyle("term", "52%")}
                onMouseDown={() => setTopWin("term")}
                onMouseEnter={() => hoverFocus("term")}

                className={`absolute rounded-md bg-black/85 ring-1 ring-[#3d5a7a] shadow-xl text-[10px] ${
                  ws("term") === "min" ? "hidden" : ""
                } ${topWin === "term" ? "z-40" : "z-30"} ${
                  drag?.kind === "window" && drag.label === "term" ? "opacity-90" : ""
                }`}
              >
                <div
                  onMouseDown={(e) => startWindowDrag(e, "term")}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    toggleMaximize("term");
                  }}
                  className={`flex items-center gap-1.5 px-2 py-1 bg-[#22354a] rounded-t-md text-[#c8d6e5] select-none ${
                    mouseLive ? "cursor-none" : "cursor-default"
                  }`}
                >

                  <span className="h-1.5 w-1.5 rounded-full bg-destructive/70" />
                  <button
                    type="button"
                    aria-label="Minimize terminal"
                    title="minimize"
                    onClick={(e) => {
                      e.stopPropagation();
                      minimizeWin("term");
                    }}
                    className="h-1.5 w-1.5 rounded-full bg-amber/70 hover:bg-amber"
                  />
                  <button
                    type="button"
                    aria-label="Maximize terminal"
                    title="maximize"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleMaximize("term");
                    }}
                    className="h-1.5 w-1.5 rounded-full bg-mint/70 hover:bg-mint"
                  />
                  <span className="ml-1.5">ubuntu@{guest.name}: ~</span>
                </div>
                <div
                  className="p-2 leading-4 text-[#a8e6a3]"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const r = frameRef.current?.getBoundingClientRect();
                    if (!r) return;
                    setMenu({
                      x: ((e.clientX - r.left) / r.width) * 100,
                      y: ((e.clientY - r.top) / r.height) * 100,
                      label: null,
                    });
                  }}
                  onAuxClick={(e) => {
                    if (e.button !== 1) return;
                    e.preventDefault();
                    pasteToTerminal();
                  }}
                >
                  {termLines.length === 0 ? (
                    <>
                      <p>ubuntu@{guest.name}:~$ xfce4-session-logout --version</p>
                      <p className="text-[#c8d6e5]">xfce4-session 4.18.3 (Xfce 4.18)</p>
                    </>
                  ) : (
                    termLines.map((l, i) => (
                      <p
                        key={`${l}-${i}`}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setTopWin("term");
                          selectTermLine(l);
                        }}
                        className={`${l.includes("$ ") ? "" : "text-[#c8d6e5]"} ${
                          termSel === l ? "bg-[#2e4258] text-[#e6f2ff]" : ""
                        } ${mouseLive ? "cursor-none" : ""}`}
                      >
                        {l}
                      </p>
                    ))
                  )}

                  <p>
                    ubuntu@{guest.name}:~$ {typed}
                    <span className="animate-pulse">▌</span>
                  </p>

                  {!keyboard.attached ? (
                    <p className="text-amber">input: no keyboard on bus — attach ⌨ to type</p>
                  ) : !grabbed ? (
                    <p className="text-amber">input: grab released — keystrokes go to local desktop</p>
                  ) : null}
                </div>
              </div>
              {/* bottom taskbar */}
              <div className="absolute bottom-0 inset-x-0 h-6 bg-[#1b2b3d]/95 border-t border-black/50 flex items-center gap-2 px-2 text-[9px] text-[#8fa8c0]">
                {/* xfce4-panel window buttons — click to focus / minimize, dbl-click to maximize */}
                {[
                  { id: "term", label: "Terminal Emulator", open: true },
                  { id: "thunar", label: openWin ? `${openWin} — Thunar` : "Thunar", open: !!openWin },
                  { id: "firefox", label: "Mozilla Firefox", open: foxWin },
                ]
                  .filter((w) => w.open)
                  .map((w) => (
                    <button
                      key={w.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (ws(w.id) === "min") restoreWin(w.id);
                        else if (topWin === w.id) minimizeWin(w.id);
                        else restoreWin(w.id);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        toggleMaximize(w.id);
                      }}
                      className={`max-w-[26%] truncate px-1.5 rounded ring-1 transition ${
                        ws(w.id) === "min"
                          ? "text-[#8fa8c0] ring-[#3d5a7a] italic"
                          : topWin === w.id
                            ? "bg-[#2e4258] text-[#c8d6e5] ring-[#7ec8ff]/50"
                            : "text-[#c8d6e5] ring-[#3d5a7a]"
                      }`}
                    >
                      {ws(w.id) === "min" ? "▁ " : ws(w.id) === "max" ? "▣ " : "▪ "}
                      {w.label}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    const next = !focusFollow;
                    setFocusFollow(next);
                    emit(
                      `xfwm4: focus mode ${next ? "focus-follows-mouse" : "click-to-focus"} (xfconf /general/focus_mode)`,
                    );
                  }}
                  className={`px-1.5 rounded ring-1 transition ${
                    focusFollow
                      ? "bg-neon/15 text-neon ring-neon/40"
                      : "text-[#8fa8c0] ring-[#3d5a7a]"
                  }`}
                >
                  focus: {focusFollow ? "hover" : "click"}
                </button>
                {termSel && (
                  <span className="truncate max-w-[38%] text-[#7ec8ff]">sel: {termSel}</span>
                )}
                <span className="flex-1" />
                <span>ws 1 · {conn.rdpTarget}</span>

              </div>
              {/* xfdesktop context menu — cut / copy / paste over the cliprdr channel */}
              {menu && (
                <div
                  style={{ left: `${Math.min(menu.x, 72)}%`, top: `${Math.min(menu.y, 70)}%` }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="absolute z-50 w-44 rounded-md bg-[#16273a]/98 ring-1 ring-[#3d5a7a] shadow-2xl py-1 text-[10px] text-[#c8d6e5]"
                >
                  <p className="px-2 pb-1 text-[9px] text-[#8fa8c0] truncate border-b border-[#3d5a7a]/60">
                    {menu.label ?? "terminal"} · cliprdr
                  </p>
                  <button
                    type="button"
                    onClick={() => void copyToChannel(menu.label)}
                    className="w-full text-left px-2 py-1 hover:bg-[#2e4258]"
                  >
                    Copy <span className="float-right text-[#8fa8c0]">Ctrl+C</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void copyToChannel(menu.label, true)}
                    className="w-full text-left px-2 py-1 hover:bg-[#2e4258]"
                  >
                    Cut <span className="float-right text-[#8fa8c0]">Ctrl+X</span>
                  </button>
                  <button
                    type="button"
                    disabled={!clipGuest}
                    onClick={pasteToTerminal}
                    className="w-full text-left px-2 py-1 hover:bg-[#2e4258] disabled:opacity-40"
                  >
                    Paste to terminal <span className="float-right text-[#8fa8c0]">Ctrl+V</span>
                  </button>
                  {clipGuest && (
                    <p className="px-2 pt-1 text-[9px] text-[#7ec8ff] truncate border-t border-[#3d5a7a]/60">
                      clip: {clipGuest}
                    </p>
                  )}
                </div>
              )}
              {/* remote cursor */}

              {mouseLive && (
                <div
                  className="absolute h-2.5 w-2.5 rounded-full bg-neon/90 shadow-[0_0_8px_rgba(120,220,255,0.9)] pointer-events-none transition-[left,top] duration-75"
                  style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
                />
              )}
            </>
          )}
        </div>

        {/* I/O bus — bus:device.function passthrough */}
        <aside className="border-t md:border-t-0 md:border-l border-railedge bg-void/40 flex flex-col min-h-0 md:max-h-full">
          <div className="shrink-0 flex items-start gap-2 px-2 py-2 border-b border-railedge">
            {busOpen && (
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-mono text-dim uppercase tracking-wider truncate">I/O bus · bdf passthrough</p>
                <p className="text-[9px] font-mono text-dim/70 mt-0.5 truncate">
                  {devices.filter((d) => d.attached).length}/{devices.length} endpoints bound ·{" "}
                  <span className={grabbed ? "text-neon" : "text-amber"}>
                    hid grab {grabbed ? "guest" : "local"}
                  </span>
                </p>
              </div>
            )}
            <button
              type="button"
              onClick={() => setBusOpen((v) => !v)}
              aria-expanded={busOpen}
              title={busOpen ? "minimize I/O bus panel" : "expand I/O bus panel"}
              className="shrink-0 text-[10px] font-mono px-1.5 py-1 rounded ring-1 ring-railedge text-dim hover:text-neon hover:ring-neon/40 transition"
            >
              {busOpen ? "»" : "«"}
            </button>
          </div>
          {!busOpen ? (
            <button
              type="button"
              onClick={() => setBusOpen(true)}
              className="flex-1 min-h-[3rem] w-full flex items-center justify-center text-[9px] font-mono text-dim hover:text-neon transition"
            >
              <span className="md:[writing-mode:vertical-rl] md:rotate-180">
                bdf {devices.filter((d) => d.attached).length}/{devices.length} · {grabbed ? "grab guest" : "grab local"}
              </span>
            </button>
          ) : (
          <>
          <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-railedge/60">
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() => toggleDevice(d)}
                aria-pressed={d.attached}
                className="w-full text-left px-3 py-2 hover:bg-panel/70 transition group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[11px]">{CLASS_ICON[d.cls]}</span>
                  <span className="text-[10px] text-ink truncate flex-1">{d.name}</span>
                  {(d.cls === "mouse" || d.cls === "keyboard") && d.attached && (
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded ring-1 ${
                        grabbed
                          ? "text-neon ring-neon/40 bg-neon/10"
                          : "text-amber ring-amber/40 bg-amber/10"
                      }`}
                    >
                      {grabbed ? "input live" : "grab off"}
                    </span>
                  )}
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded ring-1 ${
                      d.attached
                        ? "text-mint ring-mint/40 bg-mint/10"
                        : "text-dim ring-railedge"
                    }`}
                  >
                    {d.attached ? "attached" : "detached"}
                  </span>
                </div>
                <p className="text-[9px] font-mono text-dim mt-1 truncate">
                  {d.bdf} · {d.vendorId}:{d.productId} · {d.driver}
                </p>
                {d.usb && <p className="text-[9px] font-mono text-dim/70 truncate">{d.usb}</p>}
              </button>
            ))}
          </div>
          {/* cliprdr — clipboard channel */}
          <div className="px-3 py-2 border-t border-railedge">
            <div className="flex items-center gap-2">
              <span className="text-[11px]">📋</span>
              <span className="text-[10px] text-ink flex-1">Clipboard channel</span>
              <button
                type="button"
                onClick={cycleClipMode}
                className={`text-[9px] font-mono px-1.5 py-0.5 rounded ring-1 transition ${
                  clipMode === "disabled"
                    ? "text-dim ring-railedge hover:text-ink"
                    : "text-neon ring-neon/40 bg-neon/10 hover:bg-neon/20"
                }`}
              >
                {CLIP_MODES.find((m) => m.id === clipMode)?.label}
              </button>
            </div>
            <p className="text-[9px] font-mono text-dim mt-1 truncate">
              svc cliprdr · virtual channel 0x03 · CF_UNICODETEXT/UTF8_STRING
            </p>
            <p className="text-[9px] font-mono text-dim/70 mt-0.5 truncate">
              {clipXfer ?? (hostToGuest ? "idle — press Ctrl+V to stream host clipboard" : "host→guest stream off")}
            </p>
            <button
              type="button"
              onClick={copyFromGuest}
              disabled={!guestToHost || !(typed || clipGuest)}
              className="mt-1.5 w-full text-[9px] font-mono px-2 py-1 rounded ring-1 ring-railedge text-ink hover:bg-panel/70 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              copy guest selection → host clipboard
            </button>
          </div>
          <div className="px-3 py-2 border-t border-railedge min-h-[3.5rem]">

            {busLog.length === 0 ? (
              <p className="text-[9px] font-mono text-dim/60">udev quiet · no bus events</p>
            ) : (
              busLog.map((l, i) => (
                <p key={`${l}-${i}`} className="text-[9px] font-mono text-mint/80 truncate">
                  {l}
                </p>
              ))
            )}
          </div>
          </>
          )}
        </aside>
        </div>

        {/* status bar */}
        <div className="shrink-0 flex flex-wrap gap-x-3 items-center justify-between px-4 py-2 border-t border-railedge text-[10px] font-mono text-dim">
          <span>
            VRDE {conn.rdpTarget} · {guest.osType} · {done ? "1280×720 @ 32bpp" : "negotiating"}
          </span>
          <span>
            ptr {cursor.x},{cursor.y} ·{" "}
            <span className={grabbed ? "text-neon" : "text-amber"}>
              {grabbed ? "grab: guest" : "grab: local"}
            </span>{" "}
            · {mouse.attached ? `mouse ${mouse.bdf}` : "mouse detached"} ·{" "}
            {keyboard.attached ? `kbd ${keyboard.bdf}` : "kbd detached"}
          </span>
        </div>

      </div>
    </div>
  );
}
