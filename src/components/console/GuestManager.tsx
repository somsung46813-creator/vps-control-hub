import { useState } from "react";
import {
  formatMem,
  GUEST_TEMPLATES,
  type Guest,
  type Hypervisor,
} from "@/lib/guests";
import type { Vm } from "@/lib/fleet";

type Props = {
  vm: Vm;
  hypervisor: Hypervisor;
  guests: Guest[];
  onCreate: (name: string, templateIndex: number) => void;
  onPower: (guest: Guest, action: "start" | "stop" | "pause") => void;
  onDelete: (guest: Guest) => void;
  onConnect: (guest: Guest) => void;
  onToggleAutostart: (guest: Guest) => void;
};

const statusTone: Record<Guest["status"], string> = {
  running: "bg-mint/10 text-mint ring-mint/30",
  "powered off": "bg-void text-dim ring-railedge",
  paused: "bg-amber/10 text-amber ring-amber/30",
  installing: "bg-lantern/10 text-lantern ring-lantern/30",
};

export function GuestManager({
  vm,
  hypervisor,
  guests,
  onCreate,
  onPower,
  onDelete,
  onConnect,
  onToggleAutostart,
}: Props) {
  const [name, setName] = useState("");
  const [tpl, setTpl] = useState(0);
  const ready = hypervisor.installedOn.includes(vm.id);

  return (
    <div className="rounded-xl bg-panel ring-1 ring-railedge overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-railedge">
        <div>
          <p className="text-xs font-medium text-ink">Guest OS content manager</p>
          <p className="text-[10px] text-dim mt-0.5">
            {ready
              ? `${hypervisor.packageName} ${hypervisor.version} · ${vm.hostname}`
              : `hypervisor not installed on ${vm.hostname}`}
          </p>
        </div>
        <span
          className={`text-[10px] px-2 py-1 rounded ring-1 ${
            ready ? "bg-mint/10 text-mint ring-mint/30" : "bg-void text-dim ring-railedge"
          }`}
        >
          {ready ? "vboxdrv loaded" : "awaiting .deb"}
        </span>
      </div>

      {!ready ? (
        <p className="px-4 py-5 text-[11px] text-dim leading-relaxed">
          Upload a hypervisor package (e.g.{" "}
          <span className="text-ink font-mono text-[10px]">
            virtualbox-7.2_7.2.16-174877~Ubuntu~noble_amd64.deb
          </span>
          ) to the file server for this host, then press{" "}
          <span className="text-lantern">install</span> to enable guest provisioning.
        </p>
      ) : (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              onCreate(name.trim(), tpl);
              setName("");
            }}
            className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[1fr_1.2fr_auto] gap-2 border-b border-railedge/60"
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="guest name"
              aria-label="Guest name"
              className="bg-void text-xs text-ink px-2.5 py-2 rounded-md ring-1 ring-railedge outline-none focus:ring-neon/40"
            />
            <select
              value={tpl}
              onChange={(e) => setTpl(Number(e.target.value))}
              aria-label="Guest operating system"
              className="bg-void text-xs text-ink px-2.5 py-2 rounded-md ring-1 ring-railedge outline-none focus:ring-neon/40"
            >
              {GUEST_TEMPLATES.map((t, i) => (
                <option key={t.label} value={i}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="text-[11px] px-3 py-2 rounded-md bg-neon/10 text-neon ring-1 ring-neon/30 hover:bg-neon/20 transition"
            >
              Create guest
            </button>
          </form>

          <div className="divide-y divide-railedge/50 max-h-56 overflow-y-auto">
            {guests.length === 0 && (
              <p className="px-4 py-5 text-[11px] text-dim">no guest machines registered</p>
            )}
            {guests.map((g) => (
              <div key={g.id} className="px-4 py-2.5 flex items-center gap-2 text-xs">
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate">{g.name}</p>
                  <p className="text-[10px] text-dim truncate">
                    {g.osType} · {formatMem(g.memMb)} · {g.diskGb} GB vdi · {g.createdAt}
                  </p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded ring-1 ${statusTone[g.status]}`}>
                  {g.status}
                </span>
                <span className="flex items-center gap-1.5 text-[10px]">
                  <button
                    onClick={() => onPower(g, g.status === "running" ? "stop" : "start")}
                    disabled={g.status === "installing"}
                    className="px-2 py-1 rounded ring-1 ring-mint/30 bg-mint/10 text-mint hover:bg-mint/20 transition disabled:opacity-30"
                  >
                    {g.status === "running" ? "halt" : "boot"}
                  </button>
                  <button
                    onClick={() => onConnect(g)}
                    disabled={g.status !== "running"}
                    className="px-2 py-1 rounded ring-1 ring-neon/30 bg-neon/10 text-neon hover:bg-neon/20 transition disabled:opacity-30"
                  >
                    connect
                  </button>
                  <button
                    onClick={() => onToggleAutostart(g)}
                    disabled={g.status === "installing"}
                    title={g.autostart ? "Desktop autostart on — boots straight into the session" : "Enable desktop autostart on boot"}
                    className={`px-2 py-1 rounded ring-1 transition disabled:opacity-30 ${
                      g.autostart
                        ? "ring-lantern/40 bg-lantern/15 text-lantern"
                        : "ring-railedge text-dim hover:text-lantern"
                    }`}
                  >
                    {g.autostart ? "autostart on" : "autostart off"}
                  </button>
                  <button
                    onClick={() => onPower(g, "pause")}
                    disabled={g.status !== "running"}
                    className="px-2 py-1 rounded ring-1 ring-railedge text-dim hover:text-amber transition disabled:opacity-30"
                  >
                    pause
                  </button>
                  <button
                    onClick={() => onDelete(g)}
                    aria-label={`Delete guest ${g.name}`}
                    className="px-2 py-1 rounded ring-1 ring-railedge text-dim hover:text-destructive transition"
                  >
                    rm
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
