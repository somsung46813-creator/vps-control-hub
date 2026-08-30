type Props = {
  active: string;
  onSelect: (view: string) => void;
  counts: { instances: number; draining: number };
};

const ITEMS = ["Fleet overview", "Instances", "Regions", "Firewalls", "Volumes", "DNS"];

export function SideRail({ active, onSelect, counts }: Props) {
  return (
    <aside className="console-rail border-b lg:border-b-0 lg:border-r border-railedge bg-panel/60">
      <div className="console-rail-inner">
      <div className="px-5 py-5 border-b border-railedge flex items-center gap-2">
        <div className="size-7 rounded-md bg-neon/15 ring-1 ring-neon/40 grid place-items-center text-neon text-xs font-semibold">
          V
        </div>
        <div className="leading-tight">
          <p className="font-display font-semibold text-sm tracking-wide">Vantablade</p>
          <p className="text-[10px] text-dim">VPS COMMAND</p>
        </div>
      </div>
      <nav className="console-rail-nav px-3 py-3 text-xs">
        {ITEMS.map((item) => {
          const on = item === active;
          return (
            <button
              key={item}
              onClick={() => onSelect(item)}
              className={
                on
                  ? "w-full whitespace-nowrap flex items-center gap-2.5 px-3 py-2 rounded-md bg-neon/10 text-neon ring-1 ring-neon/20"
                  : "w-full whitespace-nowrap flex items-center gap-2.5 px-3 py-2 rounded-md text-dim hover:text-ink transition-colors"
              }
            >
              <span className={`size-1.5 rounded-full ${on ? "bg-neon" : "bg-dim/40"}`} />
              {item}
            </button>
          );
        })}
      </nav>
      <div className="console-rail-status px-3 py-3 border-t border-railedge text-[10px] text-dim space-y-1">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-mint pulse-dot" />
          All rails secure
        </div>
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-amber" />
          {counts.draining} node draining
        </div>
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-dim/40" />
          id 110101011
        </div>
      </div>
      </div>
    </aside>
  );
}
