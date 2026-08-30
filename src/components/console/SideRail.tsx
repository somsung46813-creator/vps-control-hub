type Props = {
  counts: { instances: number; draining: number };
};

export function SideRail({ counts }: Props) {
  return (
    <aside className="console-rail border-b lg:border-b-0 lg:border-r border-railedge bg-panel/60">
      <div className="console-rail-inner">
        <div className="px-5 py-5 border-b border-railedge flex items-center gap-2">
          <div className="size-7 shrink-0 rounded-md bg-neon/15 ring-1 ring-neon/40 grid place-items-center text-neon text-xs font-semibold">
            V
          </div>
          <div className="leading-tight min-w-0">
            <p className="font-display font-semibold text-sm tracking-wide truncate">Vantablade</p>
            <p className="text-[10px] text-dim">VPS COMMAND</p>
          </div>
        </div>
        <div className="console-rail-status px-3 py-3 text-[10px] text-dim space-y-1">
          <div className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-mint pulse-dot" />
            All rails secure
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-neon" />
            {counts.instances} instances
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-amber" />
            {counts.draining} node draining
          </div>
          <div className="flex items-center gap-2">
            <span className="size-1.5 shrink-0 rounded-full bg-dim/40" />
            id 110101011
          </div>
        </div>
      </div>
    </aside>
  );
}
