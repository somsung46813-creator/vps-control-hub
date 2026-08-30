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

/** Packages installed per guest id — persists for the life of the page session. */
const installedByGuest = new Map<string, Set<string>>();

function installed(guest: Guest): Set<string> {
  let set = installedByGuest.get(guest.id);
  if (!set) {
    set = new Set(["ssh", "systemd"]);
    installedByGuest.set(guest.id, set);
  }
  return set;
}

const APT_PACKAGES: Record<string, { desc: string; sizeMb: number; deps: string[] }> = {
  xorg: {
    desc: "X.Org X Window System server",
    sizeMb: 183,
    deps: ["xserver-xorg-core", "x11-common", "libx11-6", "xfonts-base", "xinit", "xauth", "x11-utils", "mesa-utils"],
  },
  "xserver-xorg": { desc: "X.Org X server", sizeMb: 64, deps: ["xserver-xorg-core", "x11-common", "libx11-6"] },
  "ubuntu-desktop": {
    desc: "Ubuntu desktop environment",
    sizeMb: 1840,
    deps: ["xorg", "gnome-shell", "gdm3", "nautilus", "ubuntu-session"],
  },
  xfce4: {
    desc: "XFCE lightweight desktop environment",
    sizeMb: 312,
    deps: [
      "xfce4-session", "xfwm4", "xfdesktop4", "xfce4-panel", "thunar",
      "xfce4-terminal", "xfce4-settings", "gtk3-engines-xfce", "xfconf",
    ],
  },
  "xfce4-goodies": {
    desc: "XFCE panel plugins and extra applications",
    sizeMb: 84,
    deps: ["xfce4-whiskermenu-plugin", "xfce4-taskmanager", "xfce4-screenshooter", "mousepad", "ristretto"],
  },
  lightdm: {
    desc: "Lightweight display manager",
    sizeMb: 42,
    deps: ["lightdm-gtk-greeter", "accountsservice"],
  },
  nginx: { desc: "high performance web server", sizeMb: 12, deps: ["nginx-common", "nginx-core"] },
  docker: { desc: "container runtime", sizeMb: 96, deps: ["containerd", "runc", "docker-cli"] },
};

const DESKTOPS: Record<string, { session: string; startCmd: string }> = {
  xfce4: { session: "xfce4-session", startCmd: "startxfce4" },
  "ubuntu-desktop": { session: "gnome-shell", startCmd: "gnome-session" },
};

function desktopFor(guest: Guest): { pkg: string; session: string; startCmd: string } | null {
  for (const [pkg, meta] of Object.entries(DESKTOPS)) {
    if (installed(guest).has(pkg)) return { pkg, ...meta };
  }
  return null;
}

/** Guests configured to auto-launch their desktop session from startx (~/.xinitrc). */
const autostartGuests = new Set<string>();

function writeXinitrc(guest: Guest, conn: GuestConn): string[] {
  const de = desktopFor(guest);
  if (!de) return ["no desktop environment installed — install one first: sudo apt install xfce4"];
  autostartGuests.add(guest.id);
  return [
    `$ echo "${de.startCmd}" > ~/.xinitrc`,
    `$ chmod +x ~/.xinitrc`,
    `~/.xinitrc now runs: ${de.startCmd}`,
    `Autostart configured — every \`startx\` will boot straight into ${de.session}.`,
  ];
}

function aptInstall(pkg: string, guest: Guest): string[] {
  const meta = APT_PACKAGES[pkg] ?? { desc: pkg, sizeMb: 8, deps: [`${pkg}-common`] };
  const done = installed(guest);
  const fresh = meta.deps.filter((d) => !done.has(d));
  const wasInstalled = done.has(pkg);
  if (wasInstalled) return [`${pkg} is already the newest version.`];
  fresh.forEach((d) => done.add(d));
  done.add(pkg);
  const lines = [
    "Reading package lists... Done",
    "Building dependency tree... Done",
    "Reading state information... Done",
    `The following additional packages will be installed:`,
    `  ${fresh.join(" ") || "(none)"}`,
    `The following NEW packages will be installed:`,
    `  ${pkg} ${fresh.join(" ")}`.trim(),
    `0 upgraded, ${fresh.length + 1} newly installed, 0 to remove and 2 not upgraded.`,
    `Need to get ${meta.sizeMb} MB of archives.`,
    `After this operation, ${Math.round(meta.sizeMb * 2.4)} MB of additional disk space will be used.`,
    `Get:1 http://archive.ubuntu.com/ubuntu noble/main amd64 ${pkg} amd64 [${meta.sizeMb} MB]`,
    `Fetched ${meta.sizeMb} MB in 2s (${Math.round(meta.sizeMb / 2)} MB/s)`,
    ...fresh.map((d) => `Setting up ${d} ...`),
    `Setting up ${pkg} (${meta.desc}) ...`,
    "Processing triggers for man-db ...",
  ];
  if (pkg === "xorg" || pkg === "xserver-xorg" || pkg === "ubuntu-desktop") {
    lines.push("", "X server installed. Run `startx` to launch the graphical session on this console.");
  }
  if (DESKTOPS[pkg]) {
    lines.push(
      "",
      `${DESKTOPS[pkg].session} installed. Run \`config autostart\` to make startx launch it automatically.`,
    );
  }
  return lines;
}

/** Deterministic pretend-shell for the guest session. */
export function runGuestCommand(cmd: string, guest: Guest, conn: GuestConn): string[] {
  let [bin, ...args] = cmd.trim().split(/\s+/);
  let sudo = false;
  if (bin === "sudo") {
    sudo = true;
    [bin, ...args] = args;
    if (!bin) return ["usage: sudo <command>"];
  }
  const prettyOs = guest.osType.replace(/_64$/, " (64-bit)");
  switch (bin) {
    case "":
      return [];
    case "help":
      return [
        "available: help, uname, whoami, hostname, ip, free, df, uptime, ps, ls,",
        "           cat /etc/os-release, systemctl status, apt update, dpkg -l,",
        "           sudo apt install <pkg>, startx, clear, exit",
      ];
    case "startx": {
      if (!installed(guest).has("xorg") && !installed(guest).has("xserver-xorg") && !installed(guest).has("ubuntu-desktop")) {
        return ["startx: command not found — install an X server first: sudo apt install xorg"];
      }
      const lines = [
        "xauth:  creating new authority file /home/" + conn.user + "/.Xauthority",
        "",
        "X.Org X Server 1.21.1.11",
        `(==) Using config directory: "/etc/X11/xorg.conf.d"`,
        `(II) VBOX(0): VirtualBox guest additions video driver`,
        `(II) modeset(0): 1024x768@60Hz virtual display on VRDE ${conn.vrdePort}`,
        "",
      ];
      // session lines appended below
      const de = desktopFor(guest);
      if (de && autostartGuests.has(guest.id)) {
        lines.push(`~/.xinitrc → exec ${de.startCmd}`);
        if (de.pkg === "xfce4") {
          lines.push(
            `xfce4-panel: starting desktop session for ${conn.user}`,
            `xfwm4: window manager active — 4 workspaces`,
            `xfdesktop: drawing desktop, Thunar file manager ready`,
          );
        } else {
          lines.push(`${de.session}: starting desktop session for ${conn.user}`);
        }
        lines.push("", `${de.session} started automatically — display exported to VRDE ${conn.rdpTarget}`);
      } else if (de) {
        lines.push(
          `starting ${de.startCmd} ...`,
          `${de.session} session started — display exported to VRDE ${conn.rdpTarget}`,
          `tip: run \`config autostart\` so this launches automatically every startx`,
        );
      } else {
        lines.push(`Graphical session started for ${conn.user} — display exported to VRDE ${conn.rdpTarget}`);
      }
      return lines;
    }
    case "config":
      if (args[0] === "autostart") return writeXinitrc(guest, conn);
      return ["usage: config autostart"];
    case "dpkg":
      if (args[0] === "-l" || args[0] === "--list") {
        return [
          "ii  " + [...installed(guest)].join("\nii  "),
          `(${installed(guest).size} packages)`,
        ];
      }
      return ["dpkg: need an action option"];
    case "apt": {
      const sub = args[0];
      if (sub === "update") {
        return [
          "Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease",
          "Get:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]",
          "Get:3 http://security.ubuntu.com/ubuntu noble-security InRelease [118 kB]",
          "Fetched 244 kB in 1s (240 kB/s)",
          "Reading package lists... Done",
          "2 packages can be upgraded. Run 'apt list --upgradable' to see them.",
        ];
      }
      if (sub === "install") {
        const pkg = args.filter((a) => !a.startsWith("-"))[0];
        if (!pkg) return ["E: no package specified"];
        if (!sudo) return [`E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)`, "E: Unable to acquire the dpkg frontend lock — are you root? Use: sudo apt install " + pkg];
        return [`[sudo] password for ${conn.user}: ********`, ...aptInstall(pkg, guest)];
      }
      if (sub === "remove") {
        const pkg = args.filter((a) => !a.startsWith("-"))[0];
        if (!pkg) return ["E: no package specified"];
        if (!sudo) return ["E: Permission denied — are you root? Use sudo."];
        if (!installed(guest).has(pkg)) return [`Package '${pkg}' is not installed, so not removed`];
        installed(guest).delete(pkg);
        return [`Removing ${pkg} ...`, "Processing triggers for man-db ..."];
      }
      if (sub === "list" && args.includes("--installed")) {
        return ["Listing... Done", ...[...installed(guest)].map((p) => `${p}/noble,now amd64 [installed]`)];
      }
      return ["Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease", "All packages are up to date."];
    }
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
