import { useState } from "react";
import {
  formatMem,
  GUEST_TEMPLATES,
  type Guest,
  type Hypervisor,
} from "@/lib/guests";
import type { Vm } from "@/lib/fleet";
import type { ProvisionPlan } from "@/lib/interpreter";

type Props = {
  vm: Vm;
  hypervisor: Hypervisor;
  hostLightdm: boolean;
  onInstallLightdm: () => void;
  guests: Guest[];
  onCreate: (name: string, templateIndex: number) => void;
  onPower: (guest: Guest, action: "start" | "stop" | "pause") => void;
  onDelete: (guest: Guest) => void;
  onConnect: (guest: Guest) => void;
  onOpenDesktop: (guest: Guest) => void;
  onToggleAutostart: (guest: Guest) => void;
  /** build plan per guest id, derived from the Spectrum Interpreter */
  plans?: Record<string, ProvisionPlan>;
  hostRdp?: boolean;
  hostPackages?: string[];
  onRebuild?: (guest: Guest) => void;
  onReprovision?: (guest: Guest) => void;
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
  hostLightdm,
  onInstallLightdm,
  guests,
  onCreate,
  onPower,
  onDelete,
  onConnect,
  onOpenDesktop,
  onToggleAutostart,
  plans = {},
  hostRdp = false,
  hostPackages = [],
  onRebuild,
  onReprovision,
}: Props) {
  const [name, setName] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
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
        <span className="flex items-center gap-1.5">
          {hostRdp && (
            <span className="text-[10px] px-2 py-1 rounded ring-1 bg-mint/10 text-mint ring-mint/30">
              xrdp :3389
            </span>
          )}
          {hostLightdm ? (
            <span className="text-[10px] px-2 py-1 rounded ring-1 bg-lantern/10 text-lantern ring-lantern/30">
              host lightdm active
            </span>
          ) : (
            <button
              onClick={onInstallLightdm}
              title="Install lightdm display manager on the host OS so guest sessions run on top of it"
              className="text-[10px] px-2 py-1 rounded ring-1 ring-lantern/30 bg-lantern/10 text-lantern hover:bg-lantern/20 transition"
            >
              install host lightdm
            </button>
          )}
          <span
            className={`text-[10px] px-2 py-1 rounded ring-1 ${
              ready ? "bg-mint/10 text-mint ring-mint/30" : "bg-void text-dim ring-railedge"
            }`}
          >
            {ready ? "vboxdrv loaded" : "awaiting .deb"}
          </span>
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
              <div key={g.id} className="px-4 py-2.5 text-xs">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate">{g.name}</p>
                  <p className="text-[10px] text-dim truncate">
                    {g.osType} · {formatMem(g.memMb)} · {g.diskGb} GB vdi · {g.createdAt}
                    {g.signature ? (
                      <>
                        {" · "}
                        <span className="text-lantern">b44 {g.signature}</span>
                      </>
                    ) : null}
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
                    onClick={() => onOpenDesktop(g)}
                    disabled={g.status !== "running"}
                    title="Open remote desktop viewer (VRDE)"
                    className="px-2 py-1 rounded ring-1 ring-mint/30 bg-mint/10 text-mint hover:bg-mint/20 transition disabled:opacity-30"
                  >
                    desktop
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
                  <button
                    onClick={() => setPlanId(planId === g.id ? null : g.id)}
                    className="px-2 py-1 rounded ring-1 ring-railedge text-dim hover:text-lantern transition"
                  >
                    {planId === g.id ? "hide plan" : "plan"}
                  </button>
                </span>
              </div>

              {planId === g.id && (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-[minmax(0,15rem)_1fr] gap-2">
                  <div className="rounded bg-void ring-1 ring-railedge p-2.5 space-y-2">
                    <p className="text-[10px] text-dim uppercase tracking-wide">signed key</p>
                    <p className="text-[11px] text-lantern break-all font-mono">
                      {plans[g.id]?.digest ?? g.signature ?? "unsigned"}
                    </p>
                    <p className="text-[10px] text-dim">
                      {g.osType} · {formatMem(g.memMb)} · {g.diskGb} GB · autostart{" "}
                      {g.autostart ? "on" : "off"}
                    </p>
                    <p className="text-[10px] text-dim">
                      host layer:{" "}
                      <span className="text-mint">
                        {hostPackages.length ? hostPackages.join(" ") : "not built"}
                      </span>
                    </p>
                    <div className="flex gap-1.5 pt-1">
                      <button
                        onClick={() => onRebuild?.(g)}
                        className="px-2 py-1 rounded text-[10px] bg-mint/10 text-mint ring-1 ring-mint/30 hover:bg-mint/20 transition"
                      >
                        rebuild
                      </button>
                      <button
                        onClick={() => onReprovision?.(g)}
                        className="px-2 py-1 rounded text-[10px] bg-lantern/10 text-lantern ring-1 ring-lantern/30 hover:bg-lantern/20 transition"
                      >
                        re-provision
                      </button>
                    </div>
                  </div>
                  <ul className="rounded bg-void ring-1 ring-railedge p-2.5 space-y-0.5 max-h-44 overflow-auto">
                    {(plans[g.id]?.steps ?? []).map((step, i) => (
                      <li key={i} className="text-[10px] text-dim break-all">
                        <span className="text-neon">$</span> {step}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
