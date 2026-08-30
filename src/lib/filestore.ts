export type Perms = { r: boolean; w: boolean; x: boolean };

export type HostFile = {
  id: string;
  name: string;
  size: number;
  vmId: string;
  path: string;
  owner: string;
  uploadedAt: string;
  perms: Perms;
};

const blobs = new Map<string, Blob>();

let fileSeq = 0;

export function isRunnable(name: string): boolean {
  return /\.(sh|bin|run|py|js|mjs|ts|elf|appimage)$/i.test(name) || !name.includes(".");
}

export function putBlob(id: string, blob: Blob) {
  blobs.set(id, blob);
}

export function getBlob(id: string): Blob | undefined {
  return blobs.get(id);
}

export function dropBlob(id: string) {
  blobs.delete(id);
}

export function makeHostFile(file: File, vmId: string, time: string): HostFile {
  fileSeq += 1;
  const id = `f-${fileSeq}`;
  putBlob(id, file);
  const exec = isRunnable(file.name);
  return {
    id,
    name: file.name,
    size: file.size,
    vmId,
    path: `/srv/vantage/${vmId}/${file.name}`,
    owner: "root",
    uploadedAt: time,
    perms: { r: true, w: true, x: exec },
  };
}

export function seedFiles(vmId: string): HostFile[] {
  const spec: Array<[string, number, Perms, string]> = [
    ["bootstrap.sh", 2048, { r: true, w: true, x: true }, "root"],
    ["nginx.conf", 8460, { r: true, w: true, x: false }, "root"],
    ["fleet-agent.bin", 4194304, { r: true, w: false, x: true }, "vantage"],
  ];
  return spec.map(([name, size, perms, owner], i) => ({
    id: `${vmId}-seed-${i + 1}`,
    name,
    size,
    vmId,
    path: `/srv/vantage/${vmId}/${name}`,
    owner,
    uploadedAt: "00:00:00",
    perms,
  }));
}

export function permString(p: Perms): string {
  return `${p.r ? "r" : "-"}${p.w ? "w" : "-"}${p.x ? "x" : "-"}`;
}

export function permOctal(p: Perms): string {
  const v = (p.r ? 4 : 0) + (p.w ? 2 : 0) + (p.x ? 1 : 0);
  return `${v}44`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function downloadFile(file: HostFile) {
  const blob = getBlob(file.id) ?? new Blob([`# ${file.path}\n# synthetic host artifact\n`], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
