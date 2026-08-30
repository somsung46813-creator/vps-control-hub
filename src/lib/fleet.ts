export type VmStatus = "live" | "draining" | "stopped" | "provisioning";

export type Vm = {
  id: string;
  hostname: string;
  region: string;
  status: VmStatus;
  ip: string;
  vcpu: number;
  memGb: number;
  diskGb: number;
  image: string;
  uptimeHours: number;
  cpu: number;
  mem: number;
  netMbps: number;
  diskIo: number;
  history: number[];
};

export type LogLine = {
  id: string;
  time: string;
  level: "ok" | "net" | "warn" | "err";
  text: string;
};

export const REGIONS = ["eu-central", "us-east", "ap-south"] as const;
export const IMAGES = ["Ubuntu 24.04", "Debian 12", "Alpine 3.20"] as const;
export const PLANS = [
  { label: "1 vCPU / 2 GB", vcpu: 1, memGb: 2, diskGb: 40, price: 4 },
  { label: "2 vCPU / 4 GB", vcpu: 2, memGb: 4, diskGb: 80, price: 8 },
  { label: "4 vCPU / 8 GB", vcpu: 4, memGb: 8, diskGb: 128, price: 18 },
  { label: "8 vCPU / 32 GB", vcpu: 8, memGb: 32, diskGb: 512, price: 48 },
] as const;

const clamp = (n: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, n));

// Deterministic so SSR and hydration agree.
function pseudo(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function series(base: number, seed = 0, n = 11): number[] {
  return Array.from({ length: n }, (_, i) =>
    clamp(Math.round(base + Math.sin(i * 0.9) * 12 + (pseudo(seed * 31 + i + 1) - 0.5) * 14)),
  );
}


export function seedFleet(): Vm[] {
  const spec: Array<[string, string, VmStatus, number, number, number, number, string]> = [
    ["api-gateway-01", "eu-central", "live", 68, 4, 8, 128, "42.7.9.18"],
    ["worker-queue-03", "us-east", "live", 54, 2, 4, 80, "51.14.220.6"],
    ["db-primary-02", "eu-central", "draining", 82, 8, 32, 512, "42.7.9.31"],
    ["edge-cache-11", "ap-south", "live", 33, 2, 4, 80, "13.204.77.9"],
    ["ci-runner-07", "us-east", "stopped", 0, 4, 8, 128, "51.14.220.44"],
  ];
  return spec.map(([hostname, region, status, cpu, vcpu, memGb, diskGb, ip], i) => ({
    id: `vm-${i + 1}`,
    hostname,
    region,
    status,
    ip,
    vcpu,
    memGb,
    diskGb,
    image: IMAGES[i % IMAGES.length]!,
    uptimeHours: status === "stopped" ? 0 : 120 + i * 233,
    cpu,
    mem: status === "stopped" ? 0 : clamp(cpu - 8 + i * 3),
    netMbps: status === "stopped" ? 0 : 180 + i * 260,
    diskIo: status === "stopped" ? 0 : 40 + i * 35,
    history: status === "stopped" ? Array.from({ length: 11 }, () => 0) : series(cpu, i + 1),
  }));
}

export function tickVm(vm: Vm): Vm {
  if (vm.status === "stopped") return vm;
  const drift = (Math.random() - 0.5) * 9;
  const cpu = clamp(Math.round(vm.cpu + drift), 4, 98);
  return {
    ...vm,
    cpu,
    mem: clamp(Math.round(vm.mem + (Math.random() - 0.5) * 5), 5, 96),
    netMbps: Math.max(20, Math.round(vm.netMbps + (Math.random() - 0.5) * 120)),
    diskIo: Math.max(4, Math.round(vm.diskIo + (Math.random() - 0.5) * 40)),
    uptimeHours: vm.uptimeHours + 1 / 120,
    history: [...vm.history.slice(1), cpu],
  };
}

export function fleetAverages(vms: Vm[]) {
  const active = vms.filter((v) => v.status !== "stopped");
  const n = Math.max(1, active.length);
  const sum = (f: (v: Vm) => number) => active.reduce((a, v) => a + f(v), 0);
  const memUsedGb = active.reduce((a, v) => a + (v.mem / 100) * v.memGb, 0);
  const memTotalGb = vms.reduce((a, v) => a + v.memGb, 0);
  return {
    cpu: Math.round(sum((v) => v.cpu) / n),
    memPct: Math.round((memUsedGb / Math.max(1, memTotalGb)) * 100),
    memUsedGb,
    memTotalGb,
    netGbps: sum((v) => v.netMbps) / 1000,
    netPct: clamp(Math.round(sum((v) => v.netMbps) / 60)),
    diskIo: Math.round(sum((v) => v.diskIo)),
    diskPct: clamp(Math.round(sum((v) => v.diskIo) / 12)),
  };
}

export function formatUptime(hours: number): string {
  const d = Math.floor(hours / 24);
  const h = Math.floor(hours % 24);
  return `${d}d ${String(h).padStart(2, "0")}h`;
}

export function stamp(d = new Date()): string {
  return d.toTimeString().slice(0, 8);
}

let logSeq = 0;
export function makeLog(level: LogLine["level"], text: string, time?: string): LogLine {
  logSeq += 1;
  return { id: `log-${logSeq}`, time: time ?? stamp(), level, text };
}


export function ambientLog(vms: Vm[]): LogLine {
  const vm = vms[Math.floor(Math.random() * vms.length)]!;
  const hot = vms.find((v) => v.cpu > 88 && v.status !== "stopped");
  if (hot && Math.random() > 0.6) {
    return makeLog("warn", `cpu pressure ${hot.cpu}% on ${hot.hostname}`);
  }
  const pool: Array<[LogLine["level"], string]> = [
    ["ok", `health probe 200 · ${8 + Math.floor(Math.random() * 30)}ms · ${vm.hostname}`],
    ["net", `conn ${vm.ip}:443 → 1.2.3.4:${40000 + Math.floor(Math.random() * 20000)}`],
    ["ok", `ssl cert valid · ${60 + Math.floor(Math.random() * 40)}d remaining`],
    ["ok", `agent heartbeat ack · ${vm.region}`],
    ["net", `egress ${vm.netMbps} Mb/s sustained on ${vm.hostname}`],
  ];
  const [level, text] = pool[Math.floor(Math.random() * pool.length)]!;
  return makeLog(level, text);
}
