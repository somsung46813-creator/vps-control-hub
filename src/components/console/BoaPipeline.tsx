import { STAGE_ORDER, type WorkflowRun } from "@/lib/boa";

type Props = {
  /** most recent pipeline runs, newest first */
  runs: WorkflowRun[];
  /** name of the stage currently animating, if a run is in flight */
  activeStage?: string | null;
};

const STAGE_BLURB: Record<string, string> = {
  View: "intent",
  Data: "spec",
  Grid: "placement",
  Controller: "control plane",
  Secret: "base44 key",
  Session: "session",
  Sequence: "step order",
  Model: "guest model",
  Packet: "transfer",
  Frame: "boot frames",
  Medium: "RDP medium",
};

export function BoaPipeline({ runs, activeStage = null }: Props) {
  const latest = runs[0] ?? null;
  const reached = new Set(latest?.results.map((r) => r.stage) ?? []);

  return (
    <section className="rounded-lg bg-panel ring-1 ring-railedge overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-railedge">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-dim">Infrastructure plane</p>
          <h2 className="font-display text-sm font-semibold text-ink">BOA CPU workflow</h2>
        </div>
        {latest && (
          <span className="text-[10px] text-dim font-mono">
            {latest.context.requestId}
          </span>
        )}
      </header>

      <div className="px-4 py-3">
        <ol className="grid grid-cols-1 gap-1">
          {STAGE_ORDER.map((stage, i) => {
            const result = latest?.results.find((r) => r.stage === stage);
            const done = reached.has(stage);
            const active = activeStage === stage;
            return (
              <li
                key={stage}
                className={`flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[11px] ring-1 transition-colors ${
                  active
                    ? "bg-lantern/10 text-lantern ring-lantern/40"
                    : done
                      ? "bg-neon/5 text-ink ring-railedge"
                      : "text-dim/60 ring-transparent"
                }`}
              >
                <span className="w-4 text-right font-mono text-[10px] text-dim">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className={`size-1.5 rounded-full ${done ? "bg-neon" : active ? "bg-lantern animate-pulse" : "bg-railedge"}`} />
                <span className="font-medium w-20 shrink-0">{stage}</span>
                <span className="truncate text-dim">
                  {result?.detail ?? STAGE_BLURB[stage]}
                </span>
              </li>
            );
          })}
        </ol>

        {runs.length > 1 && (
          <div className="mt-3 border-t border-railedge pt-2">
            <p className="text-[10px] uppercase tracking-[0.12em] text-dim mb-1.5">Recent runs</p>
            <ul className="grid gap-1">
              {runs.slice(1, 4).map((run) => (
                <li key={run.context.requestId} className="flex items-center justify-between text-[11px] text-dim">
                  <span className="truncate">
                    {run.context.payload.kind} · {run.context.payload.hostname}
                  </span>
                  <span className="font-mono text-[10px]">{run.context.requestId}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
