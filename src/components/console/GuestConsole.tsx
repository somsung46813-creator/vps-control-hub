import { useEffect, useMemo, useRef, useState } from "react";
import type { Guest } from "@/lib/guests";
import { formatMem } from "@/lib/guests";
import { guestConn, runGuestCommand } from "@/lib/guestshell";

type Props = {
  guest: Guest;
  hostIp: string;
  onClose: () => void;
};

export function GuestConsole({ guest, hostIp, onClose }: Props) {
  const conn = useMemo(() => guestConn(guest, hostIp), [guest, hostIp]);
  const [lines, setLines] = useState<string[]>([]);
  const [cmd, setCmd] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([
      `Connecting to ${guest.name} via VBoxHeadless VRDE ${conn.rdpTarget} ...`,
      `ssh handshake ok · ${conn.user}@${conn.ip}`,
      "",
      `Welcome to ${guest.osType.replace(/_64$/, "")} · ${formatMem(guest.memMb)} RAM · ${guest.diskGb} GB disk`,
      `Type "help" for available commands.`,
      "",
    ]);
  }, [guest.id, conn.ip, conn.rdpTarget, conn.user, guest.diskGb, guest.memMb, guest.name, guest.osType]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [lines]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const entry = cmd;
    setCmd("");
    if (entry.trim() === "clear") return setLines([]);
    if (entry.trim() === "exit") return onClose();
    setLines((prev) => [
      ...prev,
      `${conn.user}@${guest.name}:~$ ${entry}`,
      ...runGuestCommand(entry, guest, conn),
    ]);
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-void/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Console session for ${guest.name}`}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-xl bg-panel ring-1 ring-neon/30 overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-railedge">
          <div>
            <p className="text-xs text-ink">{guest.name} — remote console</p>
            <p className="text-[10px] text-dim mt-0.5 font-mono">
              {conn.isWindows ? `rdp ${conn.rdpTarget}` : conn.sshCommand} · guest ip {conn.ip}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[11px] px-2.5 py-1 rounded ring-1 ring-railedge text-dim hover:text-ink transition"
          >
            disconnect
          </button>
        </div>

        <div className="px-4 py-2 grid grid-cols-3 gap-2 text-[10px] border-b border-railedge/60 font-mono">
          <span className="text-dim">
            ssh port <span className="text-neon">{conn.sshPort}</span>
          </span>
          <span className="text-dim">
            vrde <span className="text-neon">{conn.vrdePort}</span>
          </span>
          <span className="text-dim">
            user <span className="text-neon">{conn.user}</span>
          </span>
        </div>

        <div className="h-72 overflow-y-auto px-4 py-3 font-mono text-[11px] leading-relaxed bg-void">
          {lines.map((l, i) => (
            <p key={i} className="text-ink whitespace-pre-wrap">
              {l}
            </p>
          ))}
          <div ref={endRef} />
        </div>

        <form onSubmit={submit} className="flex items-center gap-2 px-4 py-2.5 border-t border-railedge">
          <span className="font-mono text-[11px] text-mint">
            {conn.user}@{guest.name}:~$
          </span>
          <input
            autoFocus
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            aria-label="Guest command"
            className="flex-1 bg-transparent font-mono text-[11px] text-ink outline-none"
          />
        </form>
      </div>
    </div>
  );
}
