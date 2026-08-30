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
  const [view, setView] = useState("Fleet overview");
  const [logs, setLogs] = useState<LogLine[]>(() => [
    makeLog("ok", "agent 4.2.1 attached to 5 hosts", "00:00:00"),
    makeLog("net", "control plane link established · eu-central", "00:00:01"),
  ]);
  const [clock, setClock] = useState("--:--:--");
  const [command, setCommand] = useState("");
  const [deployOpen, setDeployOpen] = useState(false);
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
    }, 2600);
  }

  function submitCommand() {
    const cmd = command.trim();
    if (!cmd) return;
    push(makeLog("net", `$ ${cmd}`));
    setCommand("");
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

  const hostGuests = useMemo(
    () => guests.filter((g) => g.hostId === selected.id),
    [guests, selected.id],
  );

  function createGuest(name: string, templateIndex: number) {
    const tpl = GUEST_TEMPLATES[templateIndex]!;
    const guest = makeGuest(name, selected.id, tpl, stamp());
    setGuests((prev) => [guest, ...prev]);
    push(makeLog("net", `VBoxManage createvm --name ${name} --ostype ${tpl.osType} --register`));
    setTimeout(() => {
      setGuests((prev) =>
        prev.map((g) => (g.id === guest.id ? { ...g, status: "powered off" } : g)),
      );
      push(makeLog("ok", `${name} provisioned · ${tpl.diskGb} GB vdi attached`));
    }, 1800);
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
    }
  }

  function connectGuest(guest: Guest) {
    setSessionGuestId(guest.id);
    push(makeLog("net", `VBoxManage controlvm ${guest.name} vrde on · console session attached`));
  }

  function deleteGuest(guest: Guest) {
    setGuests((prev) => prev.filter((g) => g.id !== guest.id));
    push(makeLog("warn", `VBoxManage unregistervm ${guest.name} --delete`));
  }




  const sessionGuest = guests.find((g) => g.id === sessionGuestId && g.status === "running") ?? null;

  return (
    <div className="min-h-screen bg-void text-ink flex">
      <SideRail
        active={view}
        onSelect={setView}
        counts={{
          instances: vms.length,
          draining: vms.filter((v) => v.status === "draining").length,
        }}
      />

      <main className="flex-1 min-w-0">
        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-railedge">
          <div>
            <h1 className="font-display font-semibold text-2xl leading-tight">{view}</h1>
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

        <section className="px-6 py-5 grid grid-cols-1 xl:grid-cols-[1.15fr_1fr] gap-3">
          <div className="flex flex-col gap-3">
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
              guests={hostGuests}
              onCreate={createGuest}
              onPower={powerGuest}
              onDelete={deleteGuest}
              onConnect={connectGuest}
            />

          </div>

          <div className="flex flex-col gap-3">
            <DetailPanel vm={selected} onAction={runAction} />
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

      <DeployDrawer open={deployOpen} onClose={() => setDeployOpen(false)} onDeploy={deploy} />
      {sessionGuest && (
        <GuestConsole
          guest={sessionGuest}
          hostIp={vms.find((v) => v.id === sessionGuest.hostId)?.ip ?? selected.ip}
          onClose={() => setSessionGuestId(null)}
        />
      )}
    </div>
  );
}