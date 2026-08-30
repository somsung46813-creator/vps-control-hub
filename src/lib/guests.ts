export type GuestStatus = "powered off" | "running" | "paused" | "installing";

export type Guest = {
  id: string;
  name: string;
  hostId: string;
  osType: string;
  memMb: number;
  diskGb: number;
  status: GuestStatus;
  createdAt: string;
};

export type Hypervisor = {
  installedOn: string[]; // vm ids
  version: string | null;
  packageName: string | null;
};

export const GUEST_TEMPLATES = [
  { label: "Ubuntu 24.04 LTS (noble)", osType: "Ubuntu_64", memMb: 4096, diskGb: 40 },
  { label: "Debian 12 (bookworm)", osType: "Debian_64", memMb: 2048, diskGb: 32 },
  { label: "Windows Server 2022", osType: "Windows2022_64", memMb: 8192, diskGb: 120 },
  { label: "Alpine 3.20", osType: "Linux_64", memMb: 1024, diskGb: 16 },
  { label: "Fedora 41 Workstation", osType: "Fedora_64", memMb: 4096, diskGb: 64 },
] as const;

const DEB_RE = /^(?<pkg>[a-z0-9][a-z0-9+.-]*)[-_](?<ver>[0-9][^_]*)_(?<arch>[a-z0-9_]+)\.deb$/i;

export function isDebPackage(name: string): boolean {
  return /\.deb$/i.test(name);
}

export function parseDeb(name: string): { pkg: string; version: string; arch: string } {
  const m = DEB_RE.exec(name);
  if (!m?.groups) {
    return { pkg: name.replace(/\.deb$/i, ""), version: "unknown", arch: "amd64" };
  }
  return { pkg: m.groups["pkg"]!, version: m.groups["ver"]!, arch: m.groups["arch"]! };
}

export function isHypervisorPackage(name: string): boolean {
  return isDebPackage(name) && /virtualbox|qemu|kvm|libvirt/i.test(name);
}

let guestSeq = 0;

export function makeGuest(
  name: string,
  hostId: string,
  template: { osType: string; memMb: number; diskGb: number },
  time: string,
): Guest {
  guestSeq += 1;
  return {
    id: `g-${guestSeq}`,
    name,
    hostId,
    osType: template.osType,
    memMb: template.memMb,
    diskGb: template.diskGb,
    status: "installing",
    createdAt: time,
  };
}

export function formatMem(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB` : `${mb} MB`;
}
