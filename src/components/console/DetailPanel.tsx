import { formatUptime, type Vm } from "@/lib/fleet";

type Props = {
  vm: Vm;
  onAction: (id: string, action: "start" | "stop" | "reboot" | "snapshot") => void;
};

export function DetailPanel({ vm, onAction }: Props) {
  const avg = Math.round(vm.history.reduce((a, b) => a + b, 0) / vm.history.length);

  return (
    <div className="rounded-xl bg-panel ring-1 ring-railedge p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-ink">{vm.hostname}</p>
          <p className="text-[10px] text-dim mt-0.5">
            {vm.ip} · {vm.region} · {vm.vcpu} vCPU / {vm.memGb} GB / {vm.diskGb} GB NVMe
          </p>
          <p className="text-[10px] text-dim mt-0.5">{vm.image}</p>
        </div>
        <span className="text-[10px] text-dim px-2 py-1 rounded bg-void ring-1 ring-railedge whitespace-nowrap">
          uptime {formatUptime(vm.uptimeHours)}
        </span>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between text-[10px] text-dim mb-1">
          <span>CPU · last 60m</span>
          <span className="text-neon">avg {avg}%</span>
        </div>
        <div className="h-14 rounded bg-void ring-1 ring-railedge/60 overflow-hidden sweepline flex items-end gap-[3px] p-1">
          {vm.history.map((h, i) => (
            <div
              key={i}
              className={`flex-1 transition-[height] duration-500 ${
                i === vm.history.length - 1 ? "bg-neon" : "bg-neon/70"
              }`}
              style={{ height: `${Math.max(3, h)}%` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2 text-[10px]">
        <button
          onClick={() => onAction(vm.id, "start")}
          disabled={vm.status !== "stopped"}
          className="px-2 py-1.5 rounded-md ring-1 ring-railedge text-dim hover:text-mint hover:ring-mint/40 transition disabled:opacity-30 disabled:hover:text-dim disabled:hover:ring-railedge"
        >
          start
        </button>
        <button
          onClick={() => onAction(vm.id, "stop")}
          disabled={vm.status === "stopped"}
          className="px-2 py-1.5 rounded-md ring-1 ring-railedge text-dim hover:text-amber hover:ring-amber/40 transition disabled:opacity-30"
        >
          stop
        </button>
        <button
          onClick={() => onAction(vm.id, "reboot")}
          disabled={vm.status === "stopped"}
          className="px-2 py-1.5 rounded-md ring-1 ring-railedge text-dim hover:text-neon hover:ring-neon/40 transition disabled:opacity-30"
        >
          reboot
        </button>
        <button
          onClick={() => onAction(vm.id, "snapshot")}
          className="px-2 py-1.5 rounded-md ring-1 ring-lantern/30 bg-lantern/10 text-lantern hover:bg-lantern/20 transition"
        >
          snapshot
        </button>
      </div>
    </div>
  );
}
