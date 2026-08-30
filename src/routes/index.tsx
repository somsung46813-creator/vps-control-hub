import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { SideRail } from "@/components/console/SideRail";
import { Gauges } from "@/components/console/Gauges";
import { InstanceTable } from "@/components/console/InstanceTable";
import { DetailPanel } from "@/components/console/DetailPanel";
import { LogStream } from "@/components/console/LogStream";
import { FileServer } from "@/components/console/FileServer";
import { GuestManager } from "@/components/console/GuestManager";
import { GuestConsole } from "@/components/console/GuestConsole";
import { RemoteDesktop } from "@/components/console/RemoteDesktop";
import {
  GUEST_TEMPLATES,
  isHypervisorPackage,
  makeGuest,
  parseDeb,
  type Guest,
  type Hypervisor,
} from "@/lib/guests";
import { autostartBootLines, guestConn } from "@/lib/guestshell";
import { DeployDrawer, type DeploySpec } from "@/components/console/DeployDrawer";
import { Interpreter } from "@/components/console/Interpreter";
import {
  browserPackage,
  guestKey,
  guestSignature,
  hostSteps,
  planForGuest,
  interpreterSource,
  planWithSignature,
  type BrowserId,
  type ProvisionPlan,
} from "@/lib/interpreter";
import { BuildPlanPanel } from "@/components/console/BuildPlanPanel";



import {
  downloadFile,
  dropBlob,
  formatBytes,
  makeHostFile,
  permString,
  seedFiles,
  type HostFile,
  type Perms,
} from "@/lib/filestore";
import {
  ambientLog,
  fleetAverages,
  makeLog,
  PLANS,
  seedFleet,
  stamp,
  tickVm,
  type LogLine,
  type Vm,
} from "@/lib/fleet";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vantablade — VPS & PaaS Fleet Command Console" },
      {
        name: "description",
        content:
          "Operate platform-as-a-service host virtual machines: live CPU, memory and network telemetry, instance lifecycle control, snapshots and a streaming agent log.",
      },
      { property: "og:title", content: "Vantablade — VPS & PaaS Fleet Command Console" },
      {
        property: "og:description",
        content:
          "A dark instrument-panel console for deploying, monitoring and maintaining virtual private servers across regions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Console,
});

let idSeq = 100;

function Console() {
  const [vms, setVms] = useState<Vm[]>(() => seedFleet());
  const [selectedId, setSelectedId] = useState("vm-1");
  const [sessionGuestId, setSessionGuestId] = useState<string | null>(null);
  const [rdpGuestId, setRdpGuestId] = useState<string | null>(null);
  
  const [logs, setLogs] = useState<LogLine[]>(() => [
    makeLog("ok", "agent 4.2.1 attached to 5 hosts", "00:00:00"),
    makeLog("net", "control plane link established · eu-central", "00:00:01"),
  ]);
  const [clock, setClock] = useState("--:--:--");
  const [command, setCommand] = useState("");
  const [deployOpen, setDeployOpen] = useState(false);
  const [guestBrowsers, setGuestBrowsers] = useState<Record<string, BrowserId[]>>({});

  const [files, setFiles] = useState<HostFile[]>(() => [
    ...seedFiles("vm-1"),
    ...seedFiles("vm-2").slice(0, 1),
  ]);
  const [hypervisor, setHypervisor] = useState<Hypervisor>({
    installedOn: [],
    version: null,
    packageName: null,
  });
  const [installedPackages, setInstalledPackages] = useState<string[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  /** Host VM ids where lightdm runs on the host OS (display manager beneath the guests). */
  const [hostLightdm, setHostLightdm] = useState<string[]>([]);
  /** Host VM ids running the xrdp stack. */
  const [hostRdp, setHostRdp] = useState<string[]>([]);
  /** Packages installed on the host OS per host VM id. */
  const [hostPackages, setHostPackages] = useState<Record<string, string[]>>({});



  useEffect(() => {
    const t = setInterval(() => {
      setVms((prev) => prev.map(tickVm));
      setClock(stamp());
    }, 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setVms((current) => {
        setLogs((prev) => [...prev, ambientLog(current)].slice(-9));
        return current;
      });
    }, 4500);
    return () => clearInterval(t);
  }, []);

  const sorted = useMemo(() => [...vms].sort((a, b) => b.cpu - a.cpu), [vms]);
  const selected = vms.find((v) => v.id === selectedId) ?? vms[0]!;
  const avg = useMemo(() => fleetAverages(vms), [vms]);
  const regions = useMemo(() => new Set(vms.map((v) => v.region)).size, [vms]);

  const push = (line: LogLine) => setLogs((prev) => [...prev, line].slice(-9));

  function runAction(id: string, action: "start" | "stop" | "reboot" | "snapshot") {
    const vm = vms.find((v) => v.id === id);
    if (!vm) return;
    if (action === "snapshot") {
      push(makeLog("ok", `snapshot queued for ${vm.hostname} (${vm.diskGb} GB)`));
      return;
    }
    if (action === "stop") {
      setVms((prev) =>
        prev.map((v) =>
          v.id === id
            ? { ...v, status: "stopped", cpu: 0, mem: 0, netMbps: 0, diskIo: 0, uptimeHours: 0, history: v.history.map(() => 0) }
            : v,
        ),
      );
      push(makeLog("warn", `${vm.hostname} halted · workloads drained`));
      return;
    }
    if (action === "reboot") {
      push(makeLog("net", `${vm.hostname} rebooting · kernel handoff`));
      setVms((prev) => prev.map((v) => (v.id === id ? { ...v, status: "provisioning" } : v)));
      setTimeout(() => {
        setVms((prev) => prev.map((v) => (v.id === id ? { ...v, status: "live", uptimeHours: 0 } : v)));
        push(makeLog("ok", `${vm.hostname} back online`));
      }, 2200);
      return;
    }
    setVms((prev) =>
      prev.map((v) => (v.id === id ? { ...v, status: "provisioning", cpu: 12, mem: 18 } : v)),
    );
    push(makeLog("net", `${vm.hostname} booting from ${vm.image}`));
    setTimeout(() => {
      setVms((prev) =>
        prev.map((v) =>
          v.id === id ? { ...v, status: "live", cpu: 24, mem: 30, netMbps: 210, diskIo: 45 } : v,
        ),
      );
      push(makeLog("ok", `${vm.hostname} live · health probe 200`));
    }, 2200);
  }

  /** Hypervisor .deb sitting on the file server (any host) — the interpreter source. */
  const hypervisorDeb = useMemo(
    () => files.find((f) => isHypervisorPackage(f.name)) ?? null,
    [files],
  );

  function deploy(spec: DeploySpec) {
    const plan = PLANS[spec.planIndex]!;
    idSeq += 1;
    const id = `vm-${idSeq}`;
    const octet = 20 + (idSeq % 200);
    const vm: Vm = {
      id,
      hostname: spec.hostname,
      region: spec.region,
      status: "provisioning",
      ip: `10.0.1.${octet}`,
      vcpu: plan.vcpu,
      memGb: plan.memGb,
      diskGb: plan.diskGb,
      image: spec.image,
      uptimeHours: 0,
      cpu: 8,
      mem: 12,
      netMbps: 40,
      diskIo: 12,
      history: Array.from({ length: 11 }, () => 6),
    };
    setVms((prev) => [...prev, vm]);
    setSelectedId(id);
    setDeployOpen(false);
    push(makeLog("net", `provisioning ${vm.hostname} · allocating ${vm.ip}`));
    setTimeout(() => {
      setVms((prev) =>
        prev.map((v) => (v.id === id ? { ...v, status: "live", cpu: 26, mem: 34, netMbps: 180 } : v)),
      );
      push(makeLog("ok", `${vm.hostname} seated in ${vm.region} · ${plan.label}`));
      buildHostFromDeploy(vm, spec);
    }, 2600);
  }

  /**
   * Spectrum Interpreter chain: file server .deb → VirtualBox on the new host →
   * lightdm/xrdp host layer → signed guest bound to its build plan.
   */
  function buildHostFromDeploy(vm: Vm, spec: DeploySpec) {
    let src = interpreterSource(hypervisor.packageName, hypervisor.version);

    if (spec.installHypervisor && hypervisorDeb) {
      const meta = parseDeb(hypervisorDeb.name);
      const copy: HostFile = {
        ...hypervisorDeb,
        id: `${hypervisorDeb.id}-${vm.id}`,
        vmId: vm.id,
        path: `/srv/vantage/${vm.id}/${hypervisorDeb.name}`,
        uploadedAt: stamp(),
        perms: { r: true, w: true, x: true },
      };
      setFiles((prev) => (prev.some((f) => f.id === copy.id) ? prev : [copy, ...prev]));
      setInstalledPackages((prev) => (prev.includes(copy.id) ? prev : [...prev, copy.id]));
      push(makeLog("net", `scp ${hypervisorDeb.name} → ${vm.hostname}:${copy.path}`));
      push(makeLog("net", `dpkg -i ${copy.path} · ${meta.pkg} ${meta.version} (${meta.arch})`));
      setHypervisor((prev) => ({
        version: meta.version,
        packageName: meta.pkg,
        installedOn: prev.installedOn.includes(vm.id) ? prev.installedOn : [...prev.installedOn, vm.id],
      }));
      push(makeLog("ok", `vboxdrv kernel module built on ${vm.hostname} · guest manager online`));
      src = interpreterSource(meta.pkg, meta.version);
    } else if (spec.installHypervisor) {
      push(makeLog("warn", "no hypervisor .deb on the file server · upload virtualbox-*.deb first"));
    }

    if (spec.guestTemplateIndex >= 0) {
      const tpl = GUEST_TEMPLATES[spec.guestTemplateIndex]!;
      const guest = makeGuest(`${vm.hostname}-guest`, vm.id, tpl, stamp());
      guest.autostart = spec.autostart;
      guest.signature = guestKey(
        { name: guest.name, spec: `${tpl.osType}|${tpl.memMb}M|${tpl.diskGb}G` },
        src,
        guest.id,
      );
      const base = planForGuest(guest, src, spec.browsers);
      base.host = spec.hostDisplayStack;
      const signed = planWithSignature(base, src, guest.signature);
      setGuests((prev) => [guest, ...prev]);
      setGuestBrowsers((prev) => ({ ...prev, [guest.id]: spec.browsers }));
      push(
        makeLog("ok", `spectrum interpreter bound ${guest.name} to build plan · base44 ${guest.signature}`),
      );
      runPlanSteps(signed, guest.id, tpl.diskGb, vm.id);
      return;
    }

    if (spec.hostDisplayStack) {
      const lines: string[] = hostSteps({ browsers: spec.browsers } as ProvisionPlan);
      lines.forEach((line: string, i: number) =>
        setTimeout(() => {
          push(makeLog("net", line));
          executeStep(line, "", vm.id);
        }, i * 220),
      );
      setTimeout(
        () => push(makeLog("ok", `${vm.hostname} host layer ready · lightdm seat0 · xrdp 3389`)),
        lines.length * 220 + 400,
      );
    }
  }


  function installHostLightdm(hostId: string, via: string) {
    const host = vms.find((v) => v.id === hostId);
    if (!host) return;
    if (hostLightdm.includes(hostId)) {
      push(makeLog("ok", `lightdm is already the newest version on ${host.hostname}`));
      return;
    }
    if (host.status === "stopped") {
      push(makeLog("warn", `${host.hostname} stopped · booting before apt install`));
      runAction(host.id, "start");
    }
    push(makeLog("net", `${via} · ${host.hostname} (host OS)`));
    push(makeLog("net", "Reading package lists... Building dependency tree..."));
    setTimeout(() => {
      setHostLightdm((prev) => (prev.includes(hostId) ? prev : [...prev, hostId]));
      push(makeLog("ok", `Setting up lightdm + lightdm-gtk-greeter on ${host.hostname}`));
      push(makeLog("ok", "systemctl set-default graphical.target · display-manager.service → lightdm.service"));
      push(makeLog("ok", `host greeter live on ${host.hostname} seat0 · guest sessions will run on top of lightdm`));
      setVms((prev) =>
        prev.map((v) =>
          v.id === hostId ? { ...v, mem: Math.min(96, v.mem + 4) } : v,
        ),
      );
    }, 1400);
  }

  function submitCommand() {
    const cmd = command.trim();
    if (!cmd) return;
    push(makeLog("net", `$ ${cmd}`));
    setCommand("");
    const m = /^(?:sudo\s+)?apt(?:-get)?\s+install\s+(?:-y\s+)?(?<pkg>[\w.+-]+)/.exec(cmd);
    if (m?.groups?.["pkg"] === "lightdm") {
      installHostLightdm(selected.id, "apt install lightdm");
      return;
    }
    setTimeout(() => push(makeLog("ok", `${cmd.split(" ")[0]} completed · exit 0`)), 900);
  }

  const vmFiles = useMemo(
    () => files.filter((f) => f.vmId === selected.id),
    [files, selected.id],
  );

  function uploadFiles(list: FileList) {
    const time = stamp();
    const added = Array.from(list).map((f) => makeHostFile(f, selected.id, time));
    setFiles((prev) => [...added, ...prev]);
    added.forEach((f) =>
      push(
        makeLog(
          "net",
          `PUT ${f.path} · ${formatBytes(f.size)} · mode ${permString(f.perms)}`,
        ),
      ),
    );
  }

  function downloadHostFile(file: HostFile) {
    if (!file.perms.r) return;
    downloadFile(file);
    push(makeLog("ok", `GET ${file.path} · ${formatBytes(file.size)} streamed`));
  }

  function deleteHostFile(file: HostFile) {
    if (!file.perms.w) return;
    dropBlob(file.id);
    setFiles((prev) => prev.filter((f) => f.id !== file.id));
    push(makeLog("warn", `unlink ${file.path}`));
  }

  function togglePerm(file: HostFile, bit: keyof Perms) {
    setFiles((prev) =>
      prev.map((f) => (f.id === file.id ? { ...f, perms: { ...f.perms, [bit]: !f.perms[bit] } } : f)),
    );
    const next = { ...file.perms, [bit]: !file.perms[bit] };
    push(makeLog("net", `chmod ${permString(next)} ${file.path}`));
  }

  function runHostFile(file: HostFile) {
    if (!file.perms.x) {
      push(makeLog("err", `permission denied · ${file.path} not executable`));
      return;
    }
    const host = vms.find((v) => v.id === file.vmId);
    if (!host) return;
    if (host.status === "stopped") {
      push(makeLog("warn", `${host.hostname} stopped · booting before exec`));
      runAction(host.id, "start");
    }
    push(makeLog("net", `exec ${file.path} on ${host.hostname} · pid ${1000 + Math.floor(Math.random() * 8000)}`));
    setTimeout(() => {
      setVms((prev) =>
        prev.map((v) =>
          v.id === file.vmId
            ? {
                ...v,
                status: v.status === "stopped" ? v.status : "live",
                cpu: Math.min(96, v.cpu + 14),
                diskIo: v.diskIo + 30,
              }
            : v,
        ),
      );
      push(makeLog("ok", `${file.name} running · instance attached to ${host.hostname}`));
    }, 1200);
  }

  function installPackage(file: HostFile) {
    if (!file.perms.r) {
      push(makeLog("err", `dpkg: cannot read ${file.path}`));
      return;
    }
    const host = vms.find((v) => v.id === file.vmId);
    if (!host) return;
    const meta = parseDeb(file.name);
    push(makeLog("net", `dpkg -i ${file.path} · ${meta.pkg} ${meta.version} (${meta.arch})`));
    setInstalledPackages((prev) => (prev.includes(file.id) ? prev : [...prev, file.id]));
    if (/^lightdm/i.test(meta.pkg)) {
      installHostLightdm(host.id, `dpkg -i ${file.path}`);
      return;
    }
    setTimeout(() => {
      if (isHypervisorPackage(file.name)) {
        setHypervisor((prev) => ({
          version: meta.version,
          packageName: meta.pkg,
          installedOn: prev.installedOn.includes(host.id)
            ? prev.installedOn
            : [...prev.installedOn, host.id],
        }));
        push(makeLog("ok", `vboxdrv kernel module built · guest manager online on ${host.hostname}`));
      } else {
        push(makeLog("ok", `${meta.pkg} ${meta.version} configured on ${host.hostname}`));
      }
    }, 1600);
  }

  const interpSrc = useMemo(
    () => interpreterSource(hypervisor.packageName, hypervisor.version),
    [hypervisor.packageName, hypervisor.version],
  );

  const hostGuests = useMemo(
    () => guests.filter((g) => g.hostId === selected.id),
    [guests, selected.id],
  );

  function stampGuest(guest: Guest, signature: string) {
    setGuests((prev) =>
      prev.map((g) => (g.id === guest.id ? { ...g, signature } : g)),
    );
    push(
      makeLog(
        "net",
        `VBoxManage setextradata ${guest.name} spectrum/base44 ${signature}`,
      ),
    );
  }

  function createGuest(name: string, templateIndex: number) {
    const tpl = GUEST_TEMPLATES[templateIndex]!;
    const guest = makeGuest(name, selected.id, tpl, stamp());
    const src = interpreterSource(hypervisor.packageName, hypervisor.version);
    if (src.armed) guest.signature = guestSignature(guest, src);
    setGuests((prev) => [guest, ...prev]);
    if (guest.signature) {
      push(
        makeLog("ok", `spectrum interpreter signed ${name} · base44 ${guest.signature}`),
      );
    }
    push(makeLog("net", `VBoxManage createvm --name ${name} --ostype ${tpl.osType} --register`));
    setTimeout(() => {
      setGuests((prev) =>
        prev.map((g) => (g.id === guest.id ? { ...g, status: "powered off" } : g)),
      );
      push(makeLog("ok", `${name} provisioned · ${tpl.diskGb} GB vdi attached`));
    }, 1800);
  }

  function provisionFromPlan(plan: ProvisionPlan) {
    const tpl = GUEST_TEMPLATES[plan.templateIndex] ?? GUEST_TEMPLATES[0]!;
    const guest = makeGuest(plan.guestName, selected.id, tpl, stamp());
    const src = interpreterSource(hypervisor.packageName, hypervisor.version);
    // every guest gets its own unique base44 key from the interpreter
    guest.signature = guestKey(
      { name: guest.name, spec: `${tpl.osType}|${tpl.memMb}M|${tpl.diskGb}G` },
      src,
      guest.id,
    );
    guest.autostart = plan.autostart;
    const signed = planWithSignature(plan, src, guest.signature);
    setGuests((prev) => [guest, ...prev]);
    setGuestBrowsers((prev) => ({ ...prev, [guest.id]: plan.browsers }));
    runPlanSteps(signed, guest.id, tpl.diskGb);
  }

  /** Apply one build-plan step to real console state (not just a log line). */
  function executeStep(line: string, guestId: string, hostId: string) {
    const guestPatch = (patch: Partial<Guest>) =>
      setGuests((prev) => prev.map((g) => (g.id === guestId ? { ...g, ...patch } : g)));

    // ---- host OS layer ----
    if (/^host exec/.test(line)) {
      const pkgs = /apt-get install -y (?<list>.+)$/.exec(line)?.groups?.["list"];
      if (pkgs) {
        const list = pkgs.split(/\s+/).filter(Boolean);
        setHostPackages((prev) => ({
          ...prev,
          [hostId]: Array.from(new Set([...(prev[hostId] ?? []), ...list])),
        }));
        if (list.includes("lightdm")) {
          setHostLightdm((prev) => (prev.includes(hostId) ? prev : [...prev, hostId]));
        }
        setVms((prev) =>
          prev.map((v) =>
            v.id === hostId
              ? { ...v, status: v.status === "stopped" ? "live" : v.status, mem: Math.min(96, v.mem + 3), diskIo: v.diskIo + 8 }
              : v,
          ),
        );
      }
      if (/xrdp\.service/.test(line)) {
        setHostRdp((prev) => (prev.includes(hostId) ? prev : [...prev, hostId]));
      }
      return;
    }

    // ---- guest layer ----
    if (/VBoxManage createvm/.test(line)) guestPatch({ status: "installing" });
    if (/setextradata .* spectrum\/base44 (?<sig>\S+)/.test(line)) {
      const sig = /spectrum\/base44 (\S+)/.exec(line)?.[1];
      if (sig) guestPatch({ signature: sig });
    }
    if (/GUI\/Autostart on/.test(line)) guestPatch({ autostart: true });
    if (/^guest exec · sudo apt-get install -y (?<pkg>\S+)/.test(line)) {
      const pkg = /install -y (\S+)/.exec(line)?.[1];
      const id = (["firefox", "chromium", "google-chrome"] as BrowserId[]).find(
        (b) => pkg && browserPackage(b) === pkg,
      );
      if (id) {
        setGuestBrowsers((prev) => ({
          ...prev,
          [guestId]: Array.from(new Set([...(prev[guestId] ?? []), id])),
        }));
      }
    }
    if (/--vrde on/.test(line)) {
      setVms((prev) =>
        prev.map((v) => (v.id === hostId ? { ...v, netMbps: v.netMbps + 25 } : v)),
      );
    }
  }

  function runPlanSteps(plan: ProvisionPlan, guestId: string, diskGb?: number, hostIdOverride?: string) {
    const guest = guests.find((g) => g.id === guestId);
    const hostId = hostIdOverride ?? guest?.hostId ?? selected.id;
    plan.steps.forEach((line, i) => {
      setTimeout(() => {
        push(makeLog("net", line));
        executeStep(line, guestId, hostId);
      }, i * 220);
    });
    setTimeout(
      () => {
        setGuests((prev) =>
          prev.map((g) => (g.id === guestId ? { ...g, status: "powered off" } : g)),
        );
        push(
          makeLog(
            "ok",
            `spectrum interpreter provisioned ${plan.guestName}${
              diskGb ? ` · ${diskGb} GB vdi` : ""
            } · base44 ${plan.digest}`,
          ),
        );
      },
      plan.steps.length * 220 + 600,
    );
  }




  /** Plan per guest, keyed by the guest's own base44 signature. */
  const guestPlans = useMemo(() => {
    const out: Record<string, ProvisionPlan> = {};
    for (const g of hostGuests) out[g.id] = planForGuest(g, interpSrc, guestBrowsers[g.id] ?? []);
    return out;
  }, [hostGuests, interpSrc, guestBrowsers]);

  /** Re-run the whole plan against the existing guest (host layer included). */
  function rebuildGuest(guest: Guest) {
    const plan = guestPlans[guest.id] ?? planForGuest(guest, interpSrc, guestBrowsers[guest.id] ?? []);
    push(makeLog("net", `spectrum interpreter · rebuilding ${guest.name} · key ${plan.digest}`));
    setGuests((prev) => prev.map((g) => (g.id === guest.id ? { ...g, status: "installing" } : g)));
    runPlanSteps(plan, guest.id, guest.diskGb);
  }

  /** Destroy and re-create the guest from its plan with a freshly signed key. */
  function reprovisionGuest(guest: Guest) {
    const browsers = guestBrowsers[guest.id] ?? [];
    const base = planForGuest(guest, interpSrc, browsers);
    push(makeLog("warn", `VBoxManage unregistervm ${guest.name} --delete · re-provisioning`));
    setGuests((prev) => prev.filter((g) => g.id !== guest.id));
    const fresh = makeGuest(guest.name, guest.hostId, guest, stamp());
    fresh.autostart = guest.autostart;
    fresh.signature = guestKey(
      { name: fresh.name, spec: `${guest.osType}|${guest.memMb}M|${guest.diskGb}G` },
      interpSrc,
      fresh.id,
    );
    const signed = planWithSignature(base, interpSrc, fresh.signature);
    setGuests((prev) => [fresh, ...prev]);
    setGuestBrowsers((prev) => ({ ...prev, [fresh.id]: browsers }));
    runPlanSteps(signed, fresh.id, guest.diskGb);
  }

  function powerGuest(guest: Guest, action: "start" | "stop" | "pause") {
    const next =
      action === "start" ? "running" : action === "pause" ? "paused" : "powered off";
    setGuests((prev) => prev.map((g) => (g.id === guest.id ? { ...g, status: next } : g)));
    const verb = action === "start" ? "startvm" : action === "pause" ? "controlvm pause" : "controlvm poweroff";
    push(
      makeLog(action === "stop" ? "warn" : "ok", `VBoxManage ${verb} ${guest.name} · ${next}`),
    );
    if (action === "start") {
      setVms((prev) =>
        prev.map((v) =>
          v.id === guest.hostId
            ? { ...v, cpu: Math.min(96, v.cpu + 9), mem: Math.min(96, v.mem + 12) }
            : v,
        ),
      );
      if (hostLightdm.includes(guest.hostId)) {
        setTimeout(() => {
          push(makeLog("ok", `lightdm (host): seat0 greeter up · launching session for ${guest.name} on top of host display manager`));
        }, 900);
      }
      if (guest.autostart) {
        const hostIp = vms.find((v) => v.id === guest.hostId)?.ip ?? "0.0.0.0";
        setTimeout(() => {
          for (const line of autostartBootLines(guest, guestConn(guest, hostIp))) {
            push(makeLog("ok", `${guest.name} · ${line}`));
          }
        }, 1400);
      }
    }
  }

  function toggleGuestAutostart(guest: Guest) {
    const enabling = !guest.autostart;
    setGuests((prev) =>
      prev.map((g) => (g.id === guest.id ? { ...g, autostart: enabling } : g)),
    );
    push(
      makeLog(
        enabling ? "ok" : "warn",
        `VBoxManage setextradata ${guest.name} GUI/Autostart ${enabling ? "on" : "off"} · systemctl ${
          enabling ? "set-default graphical.target" : "set-default multi-user.target"
        }`,
      ),
    );
  }

  function connectGuest(guest: Guest) {
    setSessionGuestId(guest.id);
    push(makeLog("net", `VBoxManage controlvm ${guest.name} vrde on · console session attached`));
  }

  function openDesktop(guest: Guest) {
    setRdpGuestId(guest.id);
    const hostIp = vms.find((v) => v.id === guest.hostId)?.ip ?? selected.ip;
    const conn = guestConn(guest, hostIp);
    push(makeLog("ok", `VRDE viewer launching · rdp://${conn.rdpTarget} (${guest.name})`));
  }

  function deleteGuest(guest: Guest) {
    setGuests((prev) => prev.filter((g) => g.id !== guest.id));
    push(makeLog("warn", `VBoxManage unregistervm ${guest.name} --delete`));
  }




  const sessionGuest = guests.find((g) => g.id === sessionGuestId && g.status === "running") ?? null;
  const rdpGuest = guests.find((g) => g.id === rdpGuestId && g.status === "running") ?? null;

  return (
    <div className="console-shell bg-void text-ink">
      <SideRail
        counts={{
          instances: vms.length,
          draining: vms.filter((v) => v.status === "draining").length,
        }}
      />

      <main className="console-main min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 px-[var(--console-pad-x)] py-4 border-b border-railedge">
          <div>
            <h1 className="font-display font-semibold text-2xl leading-tight">Fleet overview</h1>
            <p className="text-xs text-dim mt-1">
              {vms.length} instances · {regions} regions · region cluster {selected.region}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-[11px] text-dim px-3 py-1.5 rounded-md bg-void ring-1 ring-railedge">
              <span>{selected.ip}</span>
              <span className="text-railedge">/</span>
              <span>prod-edge</span>
            </div>
            <button
              onClick={() => setDeployOpen(true)}
              className="text-xs font-medium px-3 py-2 rounded-md bg-lantern/10 text-lantern ring-1 ring-lantern/30 hover:bg-lantern/20 transition"
            >
              Deploy instance
            </button>
          </div>
        </header>

        <Gauges
          gauges={[
            { label: "CPU", readout: `${avg.cpu}%`, value: avg.cpu, tone: "neon" },
            {
              label: "MEMORY",
              readout: `${avg.memUsedGb.toFixed(1)} / ${avg.memTotalGb} GB`,
              value: avg.memPct,
              tone: "lantern",
            },
            {
              label: "NETWORK",
              readout: `${avg.netGbps.toFixed(1)} Gb/s`,
              value: avg.netPct,
              tone: "mint",
            },
            { label: "DISK I/O", readout: `${avg.diskIo} MB/s`, value: avg.diskPct, tone: "amber" },
          ]}
        />

        <section className="console-pad console-split">
          <div className="console-stack">
            <InstanceTable
              vms={sorted}
              selectedId={selected.id}
              onSelect={setSelectedId}
              onAction={runAction}
            />
            <FileServer
              vm={selected}
              files={vmFiles}
              installedPackages={installedPackages}
              onUpload={uploadFiles}
              onDownload={downloadHostFile}
              onRun={runHostFile}
              onInstall={installPackage}
              onDelete={deleteHostFile}
              onTogglePerm={togglePerm}
            />
            <GuestManager
              vm={selected}
              hypervisor={hypervisor}
              hostLightdm={hostLightdm.includes(selected.id)}
              onInstallLightdm={() => installHostLightdm(selected.id, "apt install lightdm")}
              guests={hostGuests}
              onCreate={createGuest}
              onPower={powerGuest}
              onDelete={deleteGuest}
              onConnect={connectGuest}
              onOpenDesktop={openDesktop}
              onToggleAutostart={toggleGuestAutostart}
              plans={guestPlans}
              hostRdp={hostRdp.includes(selected.id)}
              hostPackages={hostPackages[selected.id] ?? []}
              onRebuild={rebuildGuest}
              onReprovision={reprovisionGuest}
            />

          </div>

          <div className="console-stack">
            <DetailPanel vm={selected} onAction={runAction} />
            <Interpreter
              onEvent={(line) => push(makeLog("ok", line))}
              hypervisor={hypervisor}
              guests={hostGuests}
              onStampGuest={stampGuest}
              onProvision={provisionFromPlan}
            />
            <BuildPlanPanel
              hypervisor={hypervisor}
              guests={hostGuests}
              guestBrowsers={guestBrowsers}
              onRun={(guest, plan) => runPlanSteps(plan, guest.id)}
            />

            <LogStream
              lines={logs}
              clock={clock}
              command={command}
              onCommandChange={setCommand}
              onSubmit={submitCommand}
              source="agent"
            />
          </div>
        </section>
      </main>

      <DeployDrawer
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        onDeploy={deploy}
        hypervisorDeb={hypervisorDeb?.name ?? null}
      />
      {sessionGuest && (
        <GuestConsole
          guest={sessionGuest}
          hostIp={vms.find((v) => v.id === sessionGuest.hostId)?.ip ?? selected.ip}
          onClose={() => setSessionGuestId(null)}
        />
      )}
      {rdpGuest && (
        <RemoteDesktop
          guest={rdpGuest}
          hostIp={vms.find((v) => v.id === rdpGuest.hostId)?.ip ?? selected.ip}
          onBusEvent={(line) => push(makeLog("net", line))}
          onClose={() => setRdpGuestId(null)}
        />
      )}

    </div>
  );
}