type Gauge = {
  label: string;
  readout: string;
  value: number;
  tone: "neon" | "lantern" | "mint" | "amber";
};

const TEXT = {
  neon: "text-neon",
  lantern: "text-lantern",
  mint: "text-mint",
  amber: "text-amber",
} as const;

const BAR = {
  neon: "bg-neon",
  lantern: "bg-lantern",
  mint: "bg-mint",
  amber: "bg-amber",
} as const;

export function Gauges({ gauges }: { gauges: Gauge[] }) {
  return (
    <section className="console-pad pb-0">
      <div className="console-cards">
        {gauges.map((g) => (
          <div key={g.label} className="rounded-xl bg-panel ring-1 ring-railedge p-4">
            <div className="flex items-center justify-between text-[11px] text-dim">
              <span>{g.label}</span>
              <span className={TEXT[g.tone]}>{g.readout}</span>
            </div>
            <div className="font-display text-3xl mt-1 text-ink tabular-nums">{g.value}</div>
            <div className="mt-3 h-1.5 rounded-full bg-void overflow-hidden sweepline">
              <div
                className={`h-full rounded-full transition-[width] duration-700 ${BAR[g.tone]}`}
                style={{ width: `${g.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
