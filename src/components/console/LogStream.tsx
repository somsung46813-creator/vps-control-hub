import type { LogLine } from "@/lib/fleet";

const LEVEL = {
  ok: { text: "text-mint", tag: "[ok]" },
  net: { text: "text-neon", tag: "[net]" },
  warn: { text: "text-amber", tag: "[warn]" },
  err: { text: "text-destructive", tag: "[err]" },
} as const;

type Props = {
  lines: LogLine[];
  clock: string;
  command: string;
  onCommandChange: (value: string) => void;
  onSubmit: () => void;
  source: string;
};

export function LogStream({ lines, clock, command, onCommandChange, onSubmit, source }: Props) {
  return (
    <div className="rounded-xl bg-void ring-1 ring-railedge overflow-hidden flex-1 flex flex-col min-h-64">
      <div className="flex items-center justify-between px-3 py-2 border-b border-railedge text-[10px] text-dim">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-mint pulse-dot" />
          tail -f /var/log/vantage/{source}.log
        </span>
        <span className="tabular-nums">{clock}</span>
      </div>
      <div className="px-3 py-2.5 text-[11px] space-y-1 leading-relaxed flex-1 overflow-y-auto">
        {lines.map((l) => (
          <p key={l.id} className="text-dim">
            <span className="text-dim/50 mr-1.5 tabular-nums">{l.time}</span>
            <span className={LEVEL[l.level].text}>{LEVEL[l.level].tag}</span> {l.text}
          </p>
        ))}
      </div>
      <form
        className="flex items-center gap-2 px-3 py-2 border-t border-railedge"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <span className="text-neon text-[11px]">$</span>
        <input
          value={command}
          onChange={(e) => onCommandChange(e.target.value)}
          placeholder="rebalance --region eu-central"
          aria-label="Console command"
          className="flex-1 bg-transparent text-[11px] text-ink placeholder:text-dim/60 outline-none"
        />
      </form>
    </div>
  );
}
