import { useRef, useState } from "react";
import {
  formatBytes,
  permOctal,
  permString,
  type HostFile,
  type Perms,
} from "@/lib/filestore";
import { isDebPackage } from "@/lib/guests";
import type { Vm } from "@/lib/fleet";

type Props = {
  vm: Vm;
  files: HostFile[];
  installedPackages: string[];
  onUpload: (files: FileList) => void;
  onDownload: (file: HostFile) => void;
  onRun: (file: HostFile) => void;
  onInstall: (file: HostFile) => void;
  onDelete: (file: HostFile) => void;
  onTogglePerm: (file: HostFile, bit: keyof Perms) => void;
};


export function FileServer({
  vm,
  files,
  installedPackages,
  onUpload,
  onDownload,
  onRun,
  onInstall,
  onDelete,
  onTogglePerm,
}: Props) {

  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const bit = (on: boolean, label: string, onClick: () => void, aria: string) => (
    <button
      onClick={onClick}
      aria-label={aria}
      aria-pressed={on}
      className={`size-5 grid place-items-center rounded text-[10px] font-medium transition ${
        on
          ? "bg-neon/15 text-neon ring-1 ring-neon/40"
          : "text-dim/50 ring-1 ring-railedge hover:text-ink"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-xl bg-panel ring-1 ring-railedge overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-railedge">
        <div>
          <p className="text-xs font-medium text-ink">File server</p>
          <p className="text-[10px] text-dim mt-0.5">/srv/vantage/{vm.id} · {vm.hostname}</p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="text-[10px] px-2.5 py-1.5 rounded-md bg-lantern/10 text-lantern ring-1 ring-lantern/30 hover:bg-lantern/20 transition"
        >
          Upload
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        aria-label="Upload files to host"
        onChange={(e) => {
          if (e.target.files?.length) onUpload(e.target.files);
          e.target.value = "";
        }}
      />

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) onUpload(e.dataTransfer.files);
        }}
        className={`mx-4 mt-3 rounded-lg border border-dashed px-3 py-4 text-center text-[10px] transition ${
          over ? "border-neon/60 bg-neon/5 text-neon" : "border-railedge text-dim"
        }`}
      >
        drop artifacts here to push to {vm.hostname}
      </div>

      <div className="px-4 py-2 mt-2 grid grid-cols-[1.7fr_0.7fr_auto_auto] gap-2 text-[10px] uppercase tracking-wider text-dim border-b border-railedge/60">
        <span>File</span>
        <span>Size</span>
        <span className="text-center">rwx</span>
        <span />
      </div>

      <div className="divide-y divide-railedge/50 max-h-56 overflow-y-auto">
        {files.length === 0 && (
          <p className="px-4 py-5 text-[11px] text-dim">no artifacts mounted on this host</p>
        )}
        {files.map((f) => (
          <div
            key={f.id}
            className="px-4 py-2.5 grid grid-cols-[1.7fr_0.7fr_auto_auto] gap-2 items-center text-xs"
          >
            <div className="min-w-0">
              <p className="text-ink truncate">{f.name}</p>
              <p className="text-[10px] text-dim truncate">
                {f.owner} · {permString(f.perms)} · {permOctal(f.perms)} · {f.uploadedAt}
              </p>
            </div>
            <span className="text-dim tabular-nums text-[11px]">{formatBytes(f.size)}</span>
            <span className="flex items-center gap-1">
              {bit(f.perms.r, "r", () => onTogglePerm(f, "r"), `Toggle read on ${f.name}`)}
              {bit(f.perms.w, "w", () => onTogglePerm(f, "w"), `Toggle write on ${f.name}`)}
              {bit(f.perms.x, "x", () => onTogglePerm(f, "x"), `Toggle execute on ${f.name}`)}
            </span>
            <span className="flex items-center gap-1.5 text-[10px]">
              <button
                onClick={() => onDownload(f)}
                disabled={!f.perms.r}
                className="px-2 py-1 rounded ring-1 ring-railedge text-dim hover:text-neon hover:ring-neon/40 transition disabled:opacity-30"
              >
                get
              </button>
              {isDebPackage(f.name) ? (
                <button
                  onClick={() => onInstall(f)}
                  disabled={!f.perms.r || installedPackages.includes(f.id)}
                  className="px-2 py-1 rounded ring-1 ring-lantern/30 bg-lantern/10 text-lantern hover:bg-lantern/20 transition disabled:opacity-30"
                >
                  {installedPackages.includes(f.id) ? "installed" : "install"}
                </button>
              ) : (
                <button
                  onClick={() => onRun(f)}
                  disabled={!f.perms.x}
                  className="px-2 py-1 rounded ring-1 ring-mint/30 bg-mint/10 text-mint hover:bg-mint/20 transition disabled:opacity-30"
                >
                  run
                </button>
              )}

              <button
                onClick={() => onDelete(f)}
                disabled={!f.perms.w}
                className="px-2 py-1 rounded ring-1 ring-railedge text-dim hover:text-destructive transition disabled:opacity-30"
                aria-label={`Delete ${f.name}`}
              >
                rm
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
