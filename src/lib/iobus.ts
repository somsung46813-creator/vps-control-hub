import type { Guest } from "./guests";

export type IoClass = "mouse" | "keyboard" | "storage" | "audio" | "net" | "hid";

export type IoDevice = {
  id: string;
  /** PCI bus:device.function address, e.g. 0000:00:06.0 */
  bdf: string;
  /** USB bus/port path for USB-class endpoints, e.g. Bus 001 Device 004 */
  usb: string | null;
  vendorId: string;
  productId: string;
  name: string;
  driver: string;
  cls: IoClass;
  attached: boolean;
};

const CATALOG: Array<Omit<IoDevice, "id" | "bdf" | "usb" | "attached">> = [
  {
    name: "Logitech USB Optical Mouse",
    vendorId: "046d",
    productId: "c077",
    driver: "usbhid",
    cls: "mouse",
  },
  {
    name: "Dell KB216 Wired Keyboard",
    vendorId: "413c",
    productId: "2113",
    driver: "usbhid",
    cls: "keyboard",
  },
  {
    name: "Intel HD Audio Controller",
    vendorId: "8086",
    productId: "2668",
    driver: "snd_hda_intel",
    cls: "audio",
  },
  {
    name: "SanDisk Ultra USB 3.0",
    vendorId: "0781",
    productId: "5591",
    driver: "usb-storage",
    cls: "storage",
  },
  {
    name: "Intel PRO/1000 MT Desktop",
    vendorId: "8086",
    productId: "100e",
    driver: "e1000",
    cls: "net",
  },
  {
    name: "Wacom Intuos S Tablet",
    vendorId: "056a",
    productId: "0374",
    driver: "wacom",
    cls: "hid",
  },
];

const pad = (n: number) => n.toString(16).padStart(2, "0");

/** Deterministic bus/device/function map for a guest's virtual PCI + USB tree. */
export function ioDevices(guest: Guest): IoDevice[] {
  const seed = Number(guest.id.replace(/\D/g, "")) || 1;
  return CATALOG.map((d, i) => {
    const bus = d.cls === "net" || d.cls === "audio" ? 0 : 1;
    const dev = 3 + i;
    const fn = d.cls === "audio" ? 1 : 0;
    const usbClass = d.cls !== "net" && d.cls !== "audio";
    return {
      ...d,
      id: `${guest.id}-io-${i}`,
      bdf: `0000:${pad(bus)}:${pad(dev)}.${fn}`,
      usb: usbClass ? `Bus ${String(1 + (seed % 2)).padStart(3, "0")} Device ${String(2 + i).padStart(3, "0")}` : null,
      attached: d.cls === "mouse" || d.cls === "keyboard",
    };
  });
}

export function attachLine(d: IoDevice, guest: Guest): string {
  const target = d.usb
    ? `VBoxManage controlvm ${guest.name} usbattach ${d.vendorId}:${d.productId}`
    : `VBoxManage controlvm ${guest.name} pcidetach ${d.bdf} --reverse`;
  return `${target} → ${d.bdf} bound to ${d.driver}`;
}

export function detachLine(d: IoDevice, guest: Guest): string {
  return d.usb
    ? `VBoxManage controlvm ${guest.name} usbdetach ${d.vendorId}:${d.productId} · ${d.bdf} released`
    : `VBoxManage controlvm ${guest.name} pcidetach ${d.bdf} · driver ${d.driver} unbound`;
}

export const CLASS_ICON: Record<IoClass, string> = {
  mouse: "🖱",
  keyboard: "⌨",
  storage: "💾",
  audio: "🔊",
  net: "🌐",
  hid: "🖊",
};
