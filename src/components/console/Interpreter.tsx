import { useMemo, useState } from "react";
import {
  BASE44_ID,
  BASE44_SEED,
  base44Decode,
  interpret,
  matchesComparator,
  type Interpretation,
} from "@/lib/interpreter";

type Props = {
  onEvent?: (line: string) => void;
};

export function Interpreter({ onEvent }: Props) {
  const [input, setInput] = useState("Virtual Box");
  const [history, setHistory] = useState<Interpretation[]>([]);
  const [filter, setFilter] = useState("");
  const [decodeIn, setDecodeIn] = useState("");
  const [decodeOut, setDecodeOut] = useState<string | null>(null);

  const live = useMemo(() => interpret(input), [input]);
  const filtered = useMemo(
    () => history.filter((h) => matchesComparator(h, filter)),
    [history, filter],
  );

  function commit() {
    if (!input.trim()) return;
    const entry = interpret(input);
    setHistory((prev) => [entry, ...prev].slice(0, 8));
    onEvent?.(
      `interpreter &${BASE44_ID} · "${entry.input.slice(0, 24)}" → base44 ${entry.base44.slice(0, 18)}…`,
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
