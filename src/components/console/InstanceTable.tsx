import type { Vm, VmStatus } from "@/lib/fleet";

const STATUS_TEXT: Record<VmStatus, string> = {
  live: "text-mint",
  draining: "text-amber",
  stopped: "text-dim",
  provisioning: "text-lantern",
};

const STATUS_DOT: Record<VmStatus, string> = {
  live: "bg-mint pulse-dot",
  draining: "bg-amber",
  stopped: "bg-dim/50",
  provisioning: "bg-lantern pulse-dot",
};

const COLS = "grid grid-cols-[1.4fr_1fr_0.8fr_1.1fr_2.5rem] gap-2";

type Props = {
  vms: Vm[];
  selectedId: string;
  onSelect: (id: string) => void;
  onAction: (id: string, action: "start" | "stop" | "reboot") => void;
};

export function InstanceTable({ vms, selectedId, onSelect, onAction }: Props) {
  return (
    <div className="rounded-xl bg-panel ring-1 ring-railedge overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-railedge">
        <p className="text-xs font-medium text-ink">Instances</p>
        <p className="text-[10px] text-dim">sorted by cpu desc</p>
      </div>
      <div
        className={`${COLS} px-4 py-2 text-[10px] uppercase tracking-wider text-dim border-b border-railedge/60`}
      >
        <span>Hostname</span>
        <span>Region</span>
        <span>Status</span>
        <span>CPU</span>
        <span />
      </div>
      <div className="divide-y divide-railedge/50 text-xs">
        {vms.map((vm) => (
          <div
            key={vm.id}
            onClick={() => onSelect(vm.id)}
            className={`${COLS} px-4 py-2.5 items-center cursor-pointer transition-colors hover:bg-neon/5 ${
              vm.id === selectedId ? "bg-neon/5" : ""
            }`}
          >
            <span className="text-ink truncate">{vm.hostname}</span>
            <span className="text-dim">{vm.region}</span>
            <span className={`flex items-center gap-1.5 ${STATUS_TEXT[vm.status]}`}>
              <span className={`size-1.5 rounded-full ${STATUS_DOT[vm.status]}`} />
              {vm.status}
            </span>
            <span className="flex items-center gap-2">
              <span className="w-12 h-1 rounded-full bg-void overflow-hidden">
                <span
                  className={`block h-full transition-[width] duration-700 ${
                    vm.cpu > 80 ? "bg-amber" : vm.status === "stopped" ? "bg-dim" : "bg-neon"
                  }`}
                  style={{ width: `${Math.max(2, vm.cpu)}%` }}
                />
              </span>
              <span className="text-dim tabular-nums">{vm.cpu}%</span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAction(vm.id, vm.status === "stopped" ? "start" : "stop");
              }}
              className="text-dim hover:text-neon text-[10px] transition-colors"
              aria-label={vm.status === "stopped" ? "Start instance" : "Stop instance"}
            >
              {vm.status === "stopped" ? "▶" : "■"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
