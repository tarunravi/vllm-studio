import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GPU, LaunchProgressData, Metrics, ProcessInfo } from "@/lib/types";
import type { LeaseInfo, RuntimeSummaryData, ServiceEntry, StatusData } from "./types";
import {
  areGpusEqual,
  areLaunchProgressEqual,
  areLeasesEqual,
  areMetricsEqual,
  arePlatformKindsEqual,
  areRuntimeSummariesEqual,
  areServicesEqual,
  areStatusEqual,
} from "./equality";

const processInfo: ProcessInfo = {
  pid: 1,
  backend: "vllm",
  model_path: "/models/a",
  port: 8000,
  served_model_name: "a",
};

const status: StatusData = {
  running: true,
  process: processInfo,
  inference_port: 8000,
  launching: null,
};

const gpu: GPU = {
  index: 0,
  name: "RTX 3090",
  memory_total: 24,
  memory_used: 4,
  memory_free: 20,
  utilization: 50,
  temperature: 60,
  power_draw: 250,
  power_limit: 350,
};

const backend = { installed: true, version: "1.0" };
const runtimeSummary: RuntimeSummaryData = {
  platform: { kind: "cuda", vendor: "nvidia" },
  gpu_monitoring: { available: true, tool: "nvidia-smi" },
  backends: { vllm: backend, mlx: backend, sglang: backend, llamacpp: backend, ds4: backend },
};

describe("realtime status equality", () => {
  it("compares status and nested process identity", () => {
    assert.equal(areStatusEqual(status, status), true);
    assert.equal(areStatusEqual(status, null), false);
    assert.equal(areStatusEqual(status, { ...status, process: { ...processInfo, pid: 2 } }), false);
    assert.equal(areStatusEqual(status, { ...status, inference_port: 8001 }), false);
  });

  it("compares GPU arrays using stable runtime fields", () => {
    assert.equal(areGpusEqual([gpu], [gpu]), true);
    assert.equal(areGpusEqual([gpu], []), false);
    assert.equal(areGpusEqual([gpu], [{ ...gpu, memory_used: 5 }]), false);
    assert.equal(
      areGpusEqual(
        [{ ...gpu, temperature: undefined }],
        [{ ...gpu, temperature: null } as unknown as GPU],
      ),
      true,
    );
  });

  it("compares metrics by exact key/value shape", () => {
    const metrics: Metrics = { requests_total: 1, tokens_total: 2 };
    assert.equal(areMetricsEqual(metrics, { ...metrics }), true);
    assert.equal(areMetricsEqual(metrics, { ...metrics, latency_avg: 10 }), false);
    assert.equal(areMetricsEqual(metrics, { requests_total: 2, tokens_total: 2 }), false);
    assert.equal(areMetricsEqual(metrics, null), false);
  });

  it("compares launch, platform, service, lease, and runtime-summary snapshots", () => {
    const launch: LaunchProgressData = { recipe_id: "r1", stage: "launching", message: "Booting" };
    const service: ServiceEntry = { id: "controller", kind: "api", status: "running" };
    const lease: LeaseInfo = { holder: "session-1", since: "now" };

    assert.equal(areLaunchProgressEqual(launch, { ...launch }), true);
    assert.equal(areLaunchProgressEqual(launch, { ...launch, progress: 50 }), false);
    assert.equal(arePlatformKindsEqual("cuda", "cuda"), true);
    assert.equal(arePlatformKindsEqual("cuda", "rocm"), false);
    assert.equal(areServicesEqual([service], [{ ...service }]), true);
    assert.equal(areServicesEqual([service], [{ ...service, status: "stopped" }]), false);
    assert.equal(areLeasesEqual(lease, { holder: "session-1", since: "later" }), true);
    assert.equal(areLeasesEqual(lease, { ...lease, holder: "session-2" }), false);
    assert.equal(areRuntimeSummariesEqual(runtimeSummary, { ...runtimeSummary }), true);
    assert.equal(
      areRuntimeSummariesEqual(runtimeSummary, {
        ...runtimeSummary,
        gpu_monitoring: { ...runtimeSummary.gpu_monitoring, tool: null },
      }),
      false,
    );
  });
});
