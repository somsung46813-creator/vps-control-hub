import { useState } from "react";
import { IMAGES, PLANS, REGIONS } from "@/lib/fleet";
import { GUEST_TEMPLATES } from "@/lib/guests";
import { browserLabel, type BrowserId } from "@/lib/interpreter";

export type DeploySpec = {
  hostname: string;
  region: string;
  image: string;
  planIndex: number;
  /** install the VirtualBox .deb from the file server onto the new host */
  installHypervisor: boolean;
  /** build lightdm + xrdp host OS layer */
  hostDisplayStack: boolean;
  /** index into GUEST_TEMPLATES, or -1 for no guest */
  guestTemplateIndex: number;
  browsers: BrowserId[];
  autostart: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onDeploy: (spec: DeploySpec) => void;
  /** name of the hypervisor .deb available on the file server, if any */
  hypervisorDeb?: string | null;
};

const BROWSERS: BrowserId[] = ["firefox", "chromium", "google-chrome"];

export function DeployDrawer({ open, onClose, onDeploy, hypervisorDeb = null }: Props) {
  const [hostname, setHostname] = useState("");
  const [region, setRegion] = useState<string>(REGIONS[0]);
  const [image, setImage] = useState<string>(IMAGES[0]);
  const [planIndex, setPlanIndex] = useState(1);
  const [installHypervisor, setInstallHypervisor] = useState(true);
  const [hostDisplayStack, setHostDisplayStack] = useState(true);
  const [guestTemplateIndex, setGuestTemplateIndex] = useState(0);
  const [browsers, setBrowsers] = useState<BrowserId[]>(["firefox"]);
  const [autostart, setAutostart] = useState(true);

  if (!open) return null;

  const chip = (on: boolean) =>
    on
      ? "rounded-md px-2 py-1.5 text-[11px] text-center bg-neon/10 text-neon ring-1 ring-neon/40"
      : "rounded-md px-2 py-1.5 text-[11px] text-center text-dim ring-1 ring-railedge hover:text-ink transition-colors";

  const toggleBrowser = (b: BrowserId) =>
    setBrowsers((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));

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

        <div className="rounded-md ring-1 ring-railedge p-3 grid gap-2.5">
          <p className="text-[10px] uppercase tracking-[0.12em] text-lantern">
            Spectrum Interpreter · host build
          </p>

          <button
            onClick={() => setInstallHypervisor((v) => !v)}
            className={chip(installHypervisor) + " w-full !text-left"}
          >
            {installHypervisor ? "◉" : "○"} install VirtualBox from file server
          </button>
          <p className="text-[10px] text-dim break-all -mt-1">
            {hypervisorDeb ? `dpkg -i ${hypervisorDeb}` : "no hypervisor .deb on file server yet"}
          </p>

          <button
            onClick={() => setHostDisplayStack((v) => !v)}
            className={chip(hostDisplayStack) + " w-full !text-left"}
          >
            {hostDisplayStack ? "◉" : "○"} host OS layer · lightdm + xrdp
          </button>

          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-dim">Guest OS</p>
            <div className="mt-1.5 grid gap-1.5">
              <button className={chip(guestTemplateIndex === -1)} onClick={() => setGuestTemplateIndex(-1)}>
                none — host only
              </button>
              {GUEST_TEMPLATES.map((t, i) => (
                <button key={t.label} className={chip(i === guestTemplateIndex)} onClick={() => setGuestTemplateIndex(i)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-dim">Browsers</p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {BROWSERS.map((b) => (
                <button key={b} className={chip(browsers.includes(b))} onClick={() => toggleBrowser(b)}>
                  {browserLabel(b).split(" ").pop()}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setAutostart((v) => !v)}
            className={chip(autostart) + " w-full !text-left"}
          >
            {autostart ? "◉" : "○"} autostart desktop after boot
          </button>
        </div>

        <button
          onClick={() => {
            onDeploy({
              hostname: hostname.trim() || "app-node",
              region,
              image,
              planIndex,
              installHypervisor,
              hostDisplayStack,
              guestTemplateIndex,
              browsers,
              autostart,
            });
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
