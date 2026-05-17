import { describe, expect, it } from "bun:test";
import { parseDs4ThroughputFromLines } from "./metrics-collector";

describe("DS4 metrics log parsing", () => {
  it("extracts latest non-zero prefill and decode rates", () => {
    const sample = parseDs4ThroughputFromLines([
      "0516 21:00:20 ds4-server: chat ctx=0..54982:54982 RESPPROTO TOOLS prefill chunk 0/54982 (0.0%) chunk=0.00 t/s avg=0.00 t/s 0.000s",
      "0516 21:00:25 ds4-server: chat ctx=0..54982:54982 RESPPROTO TOOLS prefill chunk 2048/54982 (3.7%) chunk=425.06 t/s avg=425.06 t/s 4.818s",
      "0516 21:03:09 ds4-server: chat ctx=54982..55032:50 gen=50 RESPPROTO TOOLS THINKING decoding chunk=11.97 t/s avg=11.97 t/s 4.177s",
      "0516 21:03:14 ds4-server: chat ctx=55032..55082:50 gen=100 RESPPROTO TOOLS THINKING decoding chunk=11.98 t/s avg=11.98 t/s 8.351s",
    ]);

    expect(sample).toMatchObject({
      promptTps: 425.06,
      generationTps: 11.98,
    });
  });

  it("returns null when no throughput lines are present", () => {
    expect(parseDs4ThroughputFromLines(["0516 ds4-server: prompt start"])).toBeNull();
  });
});
