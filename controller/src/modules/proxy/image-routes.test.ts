import { describe, expect, it, afterEach } from "bun:test";
import { Hono } from "hono";
import type { AppContext } from "../../types/context";
import { buildHiDreamPayload, parseImageSize, registerImageGenerationRoutes } from "./image-routes";

const originalFetch = globalThis.fetch;

const createContext = (): AppContext =>
  ({
    config: {
      image_generation: {
        base_url: "http://image-node:7860",
        model: "hidream-o1-image-dev",
        adapter: "hidream",
      },
    },
  }) as unknown as AppContext;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("image generation routes", () => {
  it("parses OpenAI image size strings", () => {
    expect(parseImageSize("512x768")).toEqual({ width: 512, height: 768 });
  });

  it("builds HiDream generation payloads from OpenAI image requests", () => {
    expect(
      buildHiDreamPayload(
        {
          prompt: "red cube",
          size: "512x512",
          seed: 10,
        },
        2
      )
    ).toEqual({
      prompt: "red cube",
      mode: "t2i",
      width: 512,
      height: 512,
      seed: 12,
    });
  });

  it("adapts HiDream SSE output to OpenAI images responses", async () => {
    const app = new Hono();
    registerImageGenerationRoutes(app, createContext());

    globalThis.fetch = (async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.endsWith("/api/generate/start")) {
        return Response.json({ job_id: "job-1" });
      }
      if (url.endsWith("/api/generate/stream/job-1")) {
        const stream = new ReadableStream<Uint8Array>({
          start(controller): void {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"progress","step":1,"total":1}\n\n' +
                  'data: {"type":"done","image":"aW1hZ2U="}\n\n'
              )
            );
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return Response.json({ error: "unexpected url" }, { status: 404 });
    }) as typeof fetch;

    const response = await app.request("/v1/images/generations", {
      method: "POST",
      body: JSON.stringify({
        model: "hidream-o1-image-dev",
        prompt: "red cube",
        size: "512x512",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      model: "hidream-o1-image-dev",
      data: [{ b64_json: "aW1hZ2U=" }],
    });
  });
});
