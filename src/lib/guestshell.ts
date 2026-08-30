import type { Guest } from "./guests";
import { formatMem } from "./guests";

export type GuestConn = {
  ip: string;
  sshPort: number;
  vrdePort: number;
  user: string;
  isWindows: boolean;
  sshCommand: string;
  rdpTarget: string;
};

function seq(guest: Guest): number {
  const n = Number(guest.id.replace(/\D/g, "")) || 1;
  return n;
}

export function guestConn(guest: Guest, hostIp: string): GuestConn {
  const n = seq(guest);
  const isWindows = /windows/i.test(guest.osType);
  const user = isWindows ? "Administrator" : guest.osType.split("_")[0]!.toLowerCase();
  const sshPort = 2200 + n;
  const vrdePort = 3389 + n;
  return {
    ip: `10.0.2.${15 + n}`,
    sshPort,
    vrdePort,
    user,
    isWindows,
    sshCommand: `ssh -p ${sshPort} ${user}@${hostIp}`,
    rdpTarget: `${hostIp}:${vrdePort}`,
  };
}

/** Deterministic pretend-shell for the guest session. */
export function runGuestCommand(cmd: string, guest: Guest, conn: GuestConn): string[] {
  const [bin, ...args] = cmd.trim().split(/\s+/);
  const prettyOs = guest.osType.replace(/_64$/, " (64-bit)");
  switch (bin) {
    case "":
      return [];
    case "help":
      return [
        "available: help, uname, whoami, hostname, ip, free, df, uptime, ps, ls,",
        "           cat /etc/os-release, systemctl status, apt update, clear, exit",
      ];
    case "uname":
      return [`Linux ${guest.name} 6.8.0-generic #1 SMP x86_64 GNU/Linux`];
    case "whoami":
      return [conn.user];
    case "hostname":
      return [guest.name];
    case "ip":
      return [
        `2: enp0s3: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500`,
        `    inet ${conn.ip}/24 brd 10.0.2.255 scope global dynamic enp0s3`,
      ];
    case "free":
      return [
        "               total        used        free",
        `Mem:        ${String(guest.memMb).padStart(7)}MB   ${String(Math.round(guest.memMb * 0.31)).padStart(6)}MB   ${String(Math.round(guest.memMb * 0.69)).padStart(6)}MB`,
      ];
    case "df":
      return [
        "Filesystem      Size  Used Avail Use% Mounted on",
        `/dev/sda1       ${guest.diskGb}G  ${Math.round(guest.diskGb * 0.18)}G  ${Math.round(guest.diskGb * 0.78)}G  19% /`,
      ];
    case "uptime":
      return [`up 0 min,  1 user,  load average: 0.08, 0.03, 0.01`];
    case "ps":
      return [
        "  PID TTY          TIME CMD",
        "    1 ?        00:00:01 systemd",
        "  412 ?        00:00:00 sshd",
        "  611 pts/0    00:00:00 bash",
      ];
    case "ls":
      return ["Desktop  Documents  Downloads  snap"];
    case "cat":
      if (args[0] === "/etc/os-release") {
        return [`PRETTY_NAME="${prettyOs}"`, `ID=${conn.user}`, "VERSION_CODENAME=noble"];
      }
      return [`cat: ${args[0] ?? ""}: No such file or directory`];
    case "systemctl":
      return ["● ssh.service - OpenBSD Secure Shell server", "     Active: active (running)"];
    case "apt":
      return ["Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease", "All packages are up to date."];
    case "specs":
      return [`${guest.name} · ${prettyOs} · ${formatMem(guest.memMb)} RAM · ${guest.diskGb} GB vdi`];
    default:
      return [`${bin}: command not found`];
  }
}
