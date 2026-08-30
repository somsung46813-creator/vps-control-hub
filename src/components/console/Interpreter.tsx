import { useMemo, useState } from "react";
import {
  BASE44_ID,
  BASE44_SEED,
  base44Decode,
  browserLabel,
  guestDescriptor,
  guestSignature,
  interpret,
  interpreterSource,
  matchesComparator,
  planFromText,
  provisionSteps,
  type BrowserId,
  type Interpretation,
  type ProvisionPlan,
} from "@/lib/interpreter";
import type { Guest, Hypervisor } from "@/lib/guests";
import { formatMem } from "@/lib/guests";

type Props = {
  onEvent?: (line: string) => void;
  hypervisor?: Hypervisor;
  guests?: Guest[];
  onStampGuest?: (guest: Guest, signature: string) => void;
  onProvision?: (plan: ProvisionPlan) => void;
};

export function Interpreter({
  onEvent,
  hypervisor,
  guests = [],
  onStampGuest,
  onProvision,
}: Props) {
  const [input, setInput] = useState("Virtual Box · install Ubuntu 24.04 guest with desktop");
  const [history, setHistory] = useState<Interpretation[]>([]);
  const [filter, setFilter] = useState("");
  const [decodeIn, setDecodeIn] = useState("");
  const [decodeOut, setDecodeOut] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [browserOverride, setBrowserOverride] = useState<BrowserId[] | null>(null);

  const src = useMemo(
    () => interpreterSource(hypervisor?.packageName ?? null, hypervisor?.version ?? null),
    [hypervisor?.packageName, hypervisor?.version],
  );
  const live = useMemo(() => interpret(input), [input]);
  const plan = useMemo(() => {
    const base = planFromText(input, src);
    if (!browserOverride) return base;
    const next: ProvisionPlan = { ...base, browsers: browserOverride };
    next.steps = provisionSteps(next, src);
    return next;
  }, [input, src, browserOverride]);
  const filtered = useMemo(
    () => history.filter((h) => matchesComparator(h, filter)),
    [history, filter],
  );

  function toggleBrowser(b: BrowserId) {
    const current = plan.browsers;
    setBrowserOverride(
      current.includes(b) ? current.filter((x) => x !== b) : [...current, b],
    );
  }

  function runProvision() {
    onProvision?.(plan);
    setHistory((prev) => [interpret(input), ...prev].slice(0, 8));
  }



  function commit() {
    if (!input.trim()) return;
    const entry = interpret(input);
    setHistory((prev) => [entry, ...prev].slice(0, 8));
    onEvent?.(
      `interpreter &${BASE44_ID} · "${entry.input.slice(0, 24)}" → base44 ${entry.base44.slice(0, 18)}…`,
    );
  }

  function stampGuest(g: Guest) {
    const desc = guestDescriptor(g);
    const sig = guestSignature(g, src);
    const entry = interpret(desc);
    setHistory((prev) => [entry, ...prev].slice(0, 8));
    onStampGuest?.(g, sig);
    onEvent?.(
      `interpreter &${BASE44_ID} · ${src.pkg}@${src.version} → ${g.name} signed base44 ${sig}`,
    );
  }

  function runDecode() {
    const out = base44Decode(decodeIn.trim());
    setDecodeOut(out);
    onEvent?.(
      out === null
        ? `interpreter decode failed · symbol outside base44 alphabet`
        : `interpreter decode · ${decodeIn.trim().slice(0, 16)}… → "${out.slice(0, 24)}"`,
    );
  }

  return (
    <section className="rounded-lg bg-panel ring-1 ring-railedge overflow-hidden">
      <header className="px-4 py-3 border-b border-railedge flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-semibold text-sm">Spectrum Interpreter</h2>
          <p className="text-[10px] text-dim mt-0.5">
            text → hex → binary · Base44 · id &amp;{BASE44_ID} (seed {BASE44_SEED})
          </p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded bg-neon/10 text-neon ring-1 ring-neon/30">
          O(n) agent
        </span>
      </header>

      <div className="p-4 space-y-3 text-xs">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && commit()}
            placeholder="type text to interpret…"
            className="flex-1 min-w-0 bg-void rounded-md px-3 py-2 ring-1 ring-railedge focus:ring-neon/50 outline-none text-ink placeholder:text-dim/60"
          />
          <button
            onClick={commit}
            className="px-3 py-2 rounded-md bg-lantern/10 text-lantern ring-1 ring-lantern/30 hover:bg-lantern/20 transition"
          >
            interpret
          </button>
        </div>

        <div className="space-y-1.5">
          <Readout label="hex" value={live.hex} tone="text-neon" />
          <Readout label="bin" value={live.binary} tone="text-mint" />
          <Readout label="b44" value={live.base44} tone="text-lantern" />
          <div className="flex justify-between text-[10px] text-dim px-1">
            <span>{live.bytes} bytes</span>
            <span>{live.complexity}</span>
          </div>
        </div>

        <div className="border-t border-railedge pt-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-[10px] text-dim">virtualbox interpretation → guest build plan</p>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${
                plan.isVirtualBox
                  ? "bg-neon/10 text-neon ring-neon/30"
                  : "bg-amber/10 text-amber ring-amber/30"
              }`}
            >
              {plan.isVirtualBox ? "subject: virtualbox" : "no hypervisor subject"}
            </span>
          </div>
          <div className="rounded bg-void ring-1 ring-railedge px-2 py-2 space-y-1">
            <p className="text-ink truncate">
              {plan.guestName} <span className="text-dim">· {plan.templateLabel}</span>
            </p>
            <p className="text-[10px] text-dim">
              desktop {plan.desktop ? "xfce4 + lightdm" : "headless"} · autostart{" "}
              {plan.autostart ? "on" : "off"} · key{" "}
              <span className="text-lantern">{plan.digest}</span>
            </p>
            <div className="flex items-center gap-1.5 pt-0.5">
              <span className="text-[10px] text-dim">browsers</span>
              {(["firefox", "chromium", "google-chrome"] as BrowserId[]).map((b) => {
                const on = plan.browsers.includes(b);
                return (
                  <button
                    key={b}
                    onClick={() => toggleBrowser(b)}
                    aria-pressed={on}
                    className={`px-1.5 py-0.5 rounded text-[10px] ring-1 transition ${
                      on
                        ? "bg-mint/15 text-mint ring-mint/40"
                        : "text-dim/70 ring-railedge hover:text-ink"
                    }`}
                  >
                    {browserLabel(b)}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={runProvision}
                disabled={!src.armed}
                className="px-2.5 py-1 rounded bg-mint/10 text-mint ring-1 ring-mint/30 hover:bg-mint/20 transition text-[10px] disabled:opacity-30"
              >
                interpret &amp; provision
              </button>
              <button
                onClick={() => setShowSteps((s) => !s)}
                className="px-2.5 py-1 rounded ring-1 ring-railedge text-dim hover:text-ink transition text-[10px]"
              >
                {showSteps ? "hide steps" : `${plan.steps.length} steps`}
              </button>
              {!src.armed && (
                <span className="text-[10px] text-amber">install hypervisor .deb first</span>
              )}
            </div>
            {showSteps && (
              <ul className="pt-1 space-y-0.5 max-h-32 overflow-auto">
                {plan.steps.map((s, i) => (
                  <li key={i} className="text-[10px] text-dim break-all">
                    <span className="text-neon">$</span> {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>



        <div className="border-t border-railedge pt-3">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-[10px] text-dim">guest binding</p>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ring-1 ${
                src.armed
                  ? "bg-mint/10 text-mint ring-mint/30"
                  : "bg-amber/10 text-amber ring-amber/30"
              }`}
            >
              {src.armed ? `armed · ${src.pkg} ${src.version}` : "awaiting hypervisor .deb"}
            </span>
          </div>
          {!src.armed ? (
            <p className="text-[10px] text-dim px-1">
              upload &amp; install a hypervisor package (e.g.
              <span className="text-ink"> virtualbox-7.2_7.2.16-174877~Ubuntu~noble_amd64.deb</span>)
              on the file server to source the interpreter.
            </p>
          ) : (
            <>
              <p className="text-[10px] text-dim px-1 mb-1.5">
                source fingerprint <span className="text-lantern">{src.fingerprint}</span>
              </p>
              {guests.length === 0 ? (
                <p className="text-[10px] text-dim px-1">no guests on this host yet</p>
              ) : (
                <ul className="space-y-1 max-h-36 overflow-auto">
                  {guests.map((g) => {
                    const sig = guestSignature(g, src);
                    return (
                      <li
                        key={g.id}
                        className="px-2 py-1.5 rounded bg-void ring-1 ring-railedge flex items-center justify-between gap-2"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-ink">{g.name}</span>
                          <span className="block text-[10px] text-dim truncate">
                            {g.osType} · {formatMem(g.memMb)} · {g.diskGb} GB
                          </span>
                          <span className="block text-[10px] text-lantern truncate">{sig}</span>
                        </span>
                        <button
                          onClick={() => stampGuest(g)}
                          className="shrink-0 px-2 py-1 rounded bg-neon/10 text-neon ring-1 ring-neon/30 hover:bg-neon/20 transition text-[10px]"
                        >
                          {g.signature === sig ? "re-stamp" : "stamp"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>

        <div className="border-t border-railedge pt-3">
          <p className="text-[10px] text-dim mb-1.5">base44 decode</p>
          <div className="flex gap-2">
            <input
              value={decodeIn}
              onChange={(e) => setDecodeIn(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runDecode()}
              placeholder="paste base44…"
              className="flex-1 min-w-0 bg-void rounded-md px-3 py-1.5 ring-1 ring-railedge focus:ring-neon/50 outline-none text-ink placeholder:text-dim/60"
            />
            <button
              onClick={runDecode}
              className="px-3 py-1.5 rounded-md bg-neon/10 text-neon ring-1 ring-neon/30 hover:bg-neon/20 transition"
            >
              decode
            </button>
          </div>
          {decodeOut !== null && (
            <p className="mt-1.5 px-2 py-1.5 rounded bg-void ring-1 ring-railedge text-mint break-all">
              {decodeOut === null ? "" : decodeOut === "" ? "(empty)" : decodeOut}
            </p>
          )}
        </div>

        {history.length > 0 && (
          <div className="border-t border-railedge pt-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[10px] text-dim">interpretation log</p>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="comparator filter…"
                className="w-36 bg-void rounded px-2 py-1 ring-1 ring-railedge focus:ring-neon/50 outline-none text-ink placeholder:text-dim/60 text-[10px]"
              />
            </div>
            <ul className="space-y-1 max-h-36 overflow-auto">
              {filtered.length === 0 && (
                <li className="text-[10px] text-dim px-1">no entries match comparator</li>
              )}
              {filtered.map((h, i) => (
                <li
                  key={i}
                  className="px-2 py-1.5 rounded bg-void ring-1 ring-railedge flex items-center justify-between gap-2"
                >
                  <span className="truncate text-ink">{h.input}</span>
                  <span className="shrink-0 text-[10px] text-lantern">{h.base44.slice(0, 14)}…</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function Readout({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded bg-void ring-1 ring-railedge px-2 py-1.5">
      <span className="text-[10px] text-dim mr-2">{label}</span>
      <span className={`${tone} break-all`}>{value || "—"}</span>
    </div>
  );
}
