import { useState } from "react";
import { IMAGES, PLANS, REGIONS } from "@/lib/fleet";

export type DeploySpec = {
  hostname: string;
  region: string;
  image: string;
  planIndex: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onDeploy: (spec: DeploySpec) => void;
};

export function DeployDrawer({ open, onClose, onDeploy }: Props) {
  const [hostname, setHostname] = useState("");
  const [region, setRegion] = useState<string>(REGIONS[0]);
  const [image, setImage] = useState<string>(IMAGES[0]);
  const [planIndex, setPlanIndex] = useState(1);

  if (!open) return null;

  const chip = (on: boolean) =>
    on
      ? "rounded-md px-2 py-1.5 text-[11px] text-center bg-neon/10 text-neon ring-1 ring-neon/40"
      : "rounded-md px-2 py-1.5 text-[11px] text-center text-dim ring-1 ring-railedge hover:text-ink transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        aria-label="Close deploy panel"
        onClick={onClose}
        className="absolute inset-0 bg-void/70 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-sm h-full bg-panel border-l border-railedge p-5 flex flex-col gap-4 overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.18em] text-dim">Deploy</p>
            <h2 className="font-display text-lg font-semibold text-ink">Seat new instance</h2>
          </div>
          <button
            onClick={onClose}
            className="size-7 grid place-items-center rounded-md ring-1 ring-railedge text-dim hover:text-ink transition-colors text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-dim">Image</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {IMAGES.map((i) => (
              <button key={i} className={chip(i === image)} onClick={() => setImage(i)}>
                {i}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-dim">Region</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {REGIONS.map((r) => (
              <button key={r} className={chip(r === region)} onClick={() => setRegion(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-[10px] uppercase tracking-[0.12em] text-dim">Plan</p>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {PLANS.map((p, i) => (
              <button key={p.label} className={chip(i === planIndex)} onClick={() => setPlanIndex(i)}>
                {p.label} · ${p.price}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-[0.12em] text-dim" htmlFor="hostname">
            Hostname
          </label>
          <input
            id="hostname"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="app-fra-03"
            className="mt-1.5 w-full rounded-md bg-void ring-1 ring-railedge px-2.5 py-2 text-[12px] text-ink placeholder:text-dim/60 outline-none focus:ring-neon/50"
          />
        </div>

        <button
          onClick={() => {
            onDeploy({ hostname: hostname.trim() || "app-node", region, image, planIndex });
            setHostname("");
          }}
          className="mt-auto rounded-md bg-lantern/10 text-lantern ring-1 ring-lantern/30 px-3 py-2.5 text-sm font-medium hover:bg-lantern/20 transition"
        >
          Latch &amp; start
        </button>
      </div>
    </div>
  );
}
