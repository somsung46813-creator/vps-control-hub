import { useCallback, useEffect, useRef, useState } from "react";
import type { Guest } from "@/lib/guests";
import { guestConn } from "@/lib/guestshell";
import {
  attachLine,
  CLASS_ICON,
  detachLine,
  ioDevices,
  type IoDevice,
} from "@/lib/iobus";

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
];

export function RemoteDesktop({ guest, hostIp, onClose, onBusEvent }: Props) {
  const conn = guestConn(guest, hostIp);
  const [phase, setPhase] = useState(0); // handshake progress
  const [done, setDone] = useState(false);
  const [cursor, setCursor] = useState({ x: 62, y: 55 });
  const [devices, setDevices] = useState<IoDevice[]>(() => ioDevices(guest));
  const [typed, setTyped] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [openWin, setOpenWin] = useState<string | null>(null);
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>(() =>
    Object.fromEntries(DESKTOP_ICONS.map((i, n) => [i.label, { x: 7, y: 18 + n * 18 }])),
  );
  const [winPos, setWinPos] = useState<Record<string, { x: number; y: number }>>({
    thunar: { x: 56, y: 18 },
    term: { x: 26, y: 24 },
  });
  const [topWin, setTopWin] = useState<string>("thunar");
  const [drag, setDrag] = useState<{
    kind: "icon" | "window";
    label: string;
    dx: number;
    dy: number;
    moved: boolean;
  } | null>(null);
  const [overTrash, setOverTrash] = useState(false);

  const [trashed, setTrashed] = useState<string[]>([]);
  const dragMovedRef = useRef(false);
  const [busLog, setBusLog] = useState<string[]>([]);
  const [grabbed, setGrabbed] = useState(true);
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
      e.preventDefault();
      if (e.key === "Backspace") setTyped((t) => t.slice(0, -1));
      else if (e.key === "Enter") setTyped("");
      else if (e.key.length === 1) setTyped((t) => (t + e.key).slice(-48));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [done, keyboardLive]);

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

  function openIcon(label: string) {
    const icon = DESKTOP_ICONS.find((i) => i.label === label);
    if (!icon) return;
    setSelected(label);
    setOpenWin(label);
    emit(`thunar: open ${icon.path} · pointer click via ${mouse.bdf}`);
  }

  function move(e: React.MouseEvent) {
    const el = frameRef.current;
    if (!el || !mouseLive) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setCursor({ x: Math.round(x), y: Math.round(y) });

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
  }

  function startWindowDrag(e: React.MouseEvent, label: string) {
    if (!mouseLive) return;
    e.stopPropagation();
    e.preventDefault();
    const r = frameRef.current?.getBoundingClientRect();
    if (!r) return;
    const p = winPos[label] ?? { x: 30, y: 20 };
    setTopWin(label);
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
    } else if (drag.moved) {
      const p = pos[label];
      emit(`xdnd: drop ${label} @ ${Math.round(p?.x ?? 0)},${Math.round(p?.y ?? 0)} · icon position saved`);
    }
    setDrag(null);
    setOverTrash(false);
    // let the click that follows mouseup know it was a drag, not a selection
    setTimeout(() => {
      dragMovedRef.current = false;
    }, 0);
  }




  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl rounded-xl bg-panel ring-1 ring-railedge overflow-hidden shadow-2xl">

        {/* title bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-railedge">
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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_18rem]">
        {/* display */}
        <div
          ref={frameRef}
          onMouseMove={move}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          onClick={() => {
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
                    onMouseDown={(e) => {
                      if (!mouseLive) return;
                      e.stopPropagation();
                      e.preventDefault();
                      const r = frameRef.current?.getBoundingClientRect();
                      if (!r) return;
                      setDrag({
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
              {openWin && (
                <div className="absolute right-[6%] top-[18%] z-30 w-[38%] rounded-md bg-[#101d2b]/95 ring-1 ring-[#3d5a7a] shadow-2xl text-[10px]">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-[#22354a] rounded-t-md text-[#c8d6e5]">
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
                    <span className="h-2 w-2 rounded-full bg-amber/70" />
                    <span className="h-2 w-2 rounded-full bg-mint/70" />
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
              {/* terminal window */}
              <div className="absolute left-[26%] top-[24%] w-[52%] rounded-md bg-black/85 ring-1 ring-[#3d5a7a] shadow-xl text-[10px]">
                <div className="flex items-center gap-1.5 px-2 py-1 bg-[#22354a] rounded-t-md text-[#c8d6e5]">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive/70" />
                  <span className="h-1.5 w-1.5 rounded-full bg-amber/70" />
                  <span className="h-1.5 w-1.5 rounded-full bg-mint/70" />
                  <span className="ml-1.5">ubuntu@{guest.name}: ~</span>
                </div>
                <div className="p-2 leading-4 text-[#a8e6a3]">
                  <p>ubuntu@{guest.name}:~$ xfce4-session-logout --version</p>
                  <p className="text-[#c8d6e5]">xfce4-session 4.18.3 (Xfce 4.18)</p>
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
                <span className="px-1.5 rounded bg-[#2e4258] text-[#c8d6e5]">Terminal Emulator</span>
                <span className="flex-1" />
                <span>ws 1 · {conn.rdpTarget}</span>
              </div>
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
        <aside className="border-t lg:border-t-0 lg:border-l border-railedge bg-void/40 flex flex-col">
          <div className="px-3 py-2 border-b border-railedge">
            <p className="text-[10px] font-mono text-dim uppercase tracking-wider">I/O bus · bdf passthrough</p>
            <p className="text-[9px] font-mono text-dim/70 mt-0.5">
              {devices.filter((d) => d.attached).length}/{devices.length} endpoints bound ·{" "}
              <span className={grabbed ? "text-neon" : "text-amber"}>
                hid grab {grabbed ? "guest" : "local"}
              </span>
            </p>
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-railedge/60">
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
        </aside>
        </div>

        {/* status bar */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-railedge text-[10px] font-mono text-dim">
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
