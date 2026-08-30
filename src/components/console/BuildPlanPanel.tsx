import { useMemo, useState } from "react";
import {
  browserLabel,
  interpreterSource,
  planForGuest,
  type BrowserId,
  type ProvisionPlan,
} from "@/lib/interpreter";
import { formatMem, type Guest, type Hypervisor } from "@/lib/guests";

type Props = {
  hypervisor: Hypervisor;
  guests: Guest[];
  /** browsers provisioned per guest id */
  guestBrowsers?: Record<string, BrowserId[]>;
  onRun: (guest: Guest, plan: ProvisionPlan) => void;
};

export function BuildPlanPanel({ hypervisor, guests, guestBrowsers = {}, onRun }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const src = useMemo(
    () => interpreterSource(hypervisor.packageName, hypervisor.version),
    [hypervisor.packageName, hypervisor.version],
  );

  return (
    <section className="rounded-xl bg-panel ring-1 ring-railedge overflow-hidden">
      <header className="px-4 py-3 border-b border-railedge flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-ink">Build plan</p>
          <p className="text-[10px] text-dim mt-0.5">
            VBoxManage steps &amp; config per guest · signed by the Spectrum Interpreter
          </p>
        </div>
        <span className="text-[10px] px-2 py-1 rounded bg-lantern/10 text-lantern ring-1 ring-lantern/30">
          {guests.length} guest{guests.length === 1 ? "" : "s"}
        </span>
      </header>

      <div className="divide-y divide-railedge/50 max-h-80 overflow-y-auto">
        {guests.length === 0 && (
          <p className="px-4 py-5 text-[11px] text-dim">no guests to plan on this host</p>
        )}
        {guests.map((g) => {
          const browsers = guestBrowsers[g.id] ?? [];
          const plan = planForGuest(g, src, browsers);
          const open = openId === g.id;
          return (
            <div key={g.id} className="px-4 py-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-ink truncate">{g.name}</p>
                  <p className="text-[10px] text-dim truncate">
                    {g.osType} · {formatMem(g.memMb)} · {g.diskGb} GB · autostart{" "}
                    {g.autostart ? "on" : "off"}
                  </p>
                  <p className="text-[10px] text-lantern truncate">b44 {plan.digest}</p>
                  {browsers.length > 0 && (
                    <p className="text-[10px] text-mint truncate">
                      {browsers.map(browserLabel).join(" · ")}
                    </p>
                  )}
                </div>
                <span className="flex items-center gap-1.5 shrink-0 text-[10px]">
                  <button
                    onClick={() => setOpenId(open ? null : g.id)}
                    className="px-2 py-1 rounded ring-1 ring-railedge text-dim hover:text-ink transition"
                  >
                    {open ? "hide" : `${plan.steps.length} steps`}
                  </button>
                  <button
                    onClick={() => onRun(g, plan)}
                    className="px-2 py-1 rounded bg-mint/10 text-mint ring-1 ring-mint/30 hover:bg-mint/20 transition"
                  >
                    run
                  </button>
                </span>
              </div>
              {open && (
                <ul className="mt-2 space-y-0.5 rounded bg-void ring-1 ring-railedge px-2 py-2 max-h-40 overflow-auto">
                  {plan.steps.map((s, i) => (
                    <li key={i} className="text-[10px] text-dim break-all">
                      <span className="text-neon">$</span> {s}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
