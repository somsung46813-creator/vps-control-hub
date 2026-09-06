/**
 * BOA (BIG O API) — TypeScript port of the CPU workflow from
 * boa-bigapi-framework. Vantablade's infrastructure plane runs every
 * deploy/provision through this pipeline:
 *
 *   View → Data → Grid → Controller → Secret → Session →
 *   Sequence → Model → Packet → Frame → Medium
 *
 * Components expose process(data) and are composed behind Workflow.
 * BOAContext is the shared data envelope between stages.
 */

import { BASE44_ID, base44Encode, type BrowserId } from "./interpreter";

/* ---------- shared data envelope (context.py) ---------- */

export type BOAContext<T = unknown> = {
  requestId: string;
  timestamp: string;
  metadata: Record<string, string>;
  payload: T;
};

let ctxSeq = 0;

export function makeContext<T>(payload: T, metadata: Record<string, string> = {}): BOAContext<T> {
  ctxSeq += 1;
  return {
    requestId: `boa-${base44Encode(`${BASE44_ID}:${ctxSeq}`).slice(0, 8)}`,
    timestamp: new Date().toISOString(),
    metadata,
    payload,
  };
}

/* ---------- infra request the pipeline processes ---------- */

export type InfraRequest = {
  kind: "deploy-host" | "provision-guest" | "rebuild-guest";
  hostname: string;
  region?: string;
  planLabel?: string;
  guestName?: string;
  osType?: string;
  browsers?: BrowserId[];
  /** base44 signature bound by the Spectrum Interpreter, when armed */
  signature?: string;
  hypervisorPkg?: string | null;
};

/* ---------- stage contract (cpu_workflow/*) ---------- */

export type StageName =
  | "View"
  | "Data"
  | "Grid"
  | "Controller"
  | "Secret"
  | "Session"
  | "Sequence"
  | "Model"
  | "Packet"
  | "Frame"
  | "Medium";

export const STAGE_ORDER: StageName[] = [
  "View",
  "Data",
  "Grid",
  "Controller",
  "Secret",
  "Session",
  "Sequence",
  "Model",
  "Packet",
  "Frame",
  "Medium",
];

export type StageResult = {
  stage: StageName;
  detail: string;
};

type StageComponent = {
  name: StageName;
  process: (ctx: BOAContext<InfraRequest>) => StageResult;
};

/* ---------- CPU pipeline implementations ---------- */

const COMPONENTS: StageComponent[] = [
  {
    name: "View",
    process: (ctx) => ({
      stage: "View",
      detail: `render intent · ${ctx.payload.kind} "${ctx.payload.hostname}"`,
    }),
  },
  {
    name: "Data",
    process: (ctx) => ({
      stage: "Data",
      detail: `normalize spec · ${ctx.payload.planLabel ?? ctx.payload.osType ?? "default"}`,
    }),
  },
  {
    name: "Grid",
    process: (ctx) => ({
      stage: "Grid",
      detail: `place on region grid · ${ctx.payload.region ?? "host-local"}`,
    }),
  },
  {
    name: "Controller",
    process: (ctx) => ({
      stage: "Controller",
      detail: `control plane latch · agent attached to ${ctx.payload.hostname}`,
    }),
  },
  {
    name: "Secret",
    process: (ctx) => ({
      stage: "Secret",
      detail: ctx.payload.signature
        ? `key slot sealed · base44 ${ctx.payload.signature}`
        : `key slot idle · interpreter &${BASE44_ID} awaiting hypervisor`,
    }),
  },
  {
    name: "Session",
    process: (ctx) => ({
      stage: "Session",
      detail: `session opened · ${ctx.requestId} bound to ${ctx.payload.hostname}`,
    }),
  },
  {
    name: "Sequence",
    process: (ctx) => ({
      stage: "Sequence",
      detail:
        ctx.payload.kind === "deploy-host"
          ? "sequence: dpkg hypervisor → lightdm/xrdp → guest createvm"
          : "sequence: VBoxManage createvm → modifyvm → storagectl",
    }),
  },
  {
    name: "Model",
    process: (ctx) => ({
      stage: "Model",
      detail: `model materialized · ${ctx.payload.guestName ?? ctx.payload.hostname}`,
    }),
  },
  {
    name: "Packet",
    process: (ctx) => ({
      stage: "Packet",
      detail: ctx.payload.hypervisorPkg
        ? `packet: scp ${ctx.payload.hypervisorPkg} → /srv/vantage`
        : "packet: plan digest + spec frames queued",
    }),
  },
  {
    name: "Frame",
    process: (ctx) => ({
      stage: "Frame",
      detail: "frame: boot frames streaming · health probe 200",
    }),
  },
  {
    name: "Medium",
    process: (ctx) => {
      const browsers = ctx.payload.browsers?.length
        ? ` · browsers ${ctx.payload.browsers.join("/")}`
        : "";
      return {
        stage: "Medium",
        detail: `medium: RDP/VRDE transport live :3389 → :3390${browsers}`,
      };
    },
  },
];

/* ---------- Workflow / CPUWorkflow (workflow.py) ---------- */

export type WorkflowRun = {
  context: BOAContext<InfraRequest>;
  results: StageResult[];
};

export class CPUWorkflow {
  private components: StageComponent[] = [...COMPONENTS];

  use(component: StageComponent) {
    this.components.push(component);
    return this;
  }

  execute(ctx: BOAContext<InfraRequest>): WorkflowRun {
    const results = this.components.map((c) => c.process(ctx));
    return { context: ctx, results };
  }
}

/* ---------- BOA facade (__init__.py) ---------- */

export class BOA {
  constructor(private workflow: CPUWorkflow) {}

  execute(request: InfraRequest): WorkflowRun {
    const ctx = makeContext(request, { source: "vantablade-infra", agent: `&${BASE44_ID}` });
    return this.workflow.execute(ctx);
  }
}

export function createBoa(): BOA {
  return new BOA(new CPUWorkflow());
}

/* ---------- Prismatics (prismatics.py) — backend-neutral GPU ops ---------- */

export type PrismaticOp = { op: "pitch" | "roll" | "index" | "scatter"; value: number | string };

/** Compose Prismatics ops, delegate to a backend at compute() time. */
export class Prismatics {
  private ops: PrismaticOp[] = [];
  constructor(private backend: (ops: PrismaticOp[]) => string) {}

  pitch(deg: number) {
    this.ops.push({ op: "pitch", value: deg });
    return this;
  }
  roll(deg: number) {
    this.ops.push({ op: "roll", value: deg });
    return this;
  }
  index(mapping: string) {
    this.ops.push({ op: "index", value: mapping });
    return this;
  }
  scatter(points: string) {
    this.ops.push({ op: "scatter", value: points });
    return this;
  }
  compute(): string {
    return this.backend(this.ops);
  }
}
