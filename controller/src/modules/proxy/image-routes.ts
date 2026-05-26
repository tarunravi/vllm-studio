import type { Hono } from "hono";
import { badRequest, notFound, serviceUnavailable } from "../../core/errors";
import type { ImageGenerationConfig } from "../../config/env";
import type { AppContext } from "../../types/context";

interface ImageGenerationPayload {
  model?: unknown;
  prompt?: unknown;
  n?: unknown;
  size?: unknown;
  response_format?: unknown;
  seed?: unknown;
}

interface ImageSize {
  width: number;
  height: number;
}

const DEFAULT_IMAGE_SIZE: ImageSize = { width: 1024, height: 1024 };

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

const buildOpenAIImageUrl = (baseUrl: string): string => {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith("/v1")
    ? `${normalized}/images/generations`
    : `${normalized}/v1/images/generations`;
};

const buildHiDreamUrl = (baseUrl: string, path: string): string =>
  `${normalizeBaseUrl(baseUrl)}${path}`;

export const parseImageSize = (raw: unknown): ImageSize => {
  if (typeof raw !== "string" || raw.trim() === "") return DEFAULT_IMAGE_SIZE;
  const match = raw.trim().match(/^(\d+)x(\d+)$/i);
  if (!match) {
    throw badRequest("size must use WIDTHxHEIGHT format");
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw badRequest("size must contain positive integer dimensions");
  }
  return { width, height };
};

const positiveIntegerFromUnknown = (value: unknown, fallback: number): number => {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest("n must be a positive integer");
  }
  return parsed;
};

const optionalIntegerFromUnknown = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) {
    throw badRequest("seed must be an integer");
  }
  return parsed;
};

export const buildHiDreamPayload = (
  payload: ImageGenerationPayload,
  index: number
): Record<string, unknown> => {
  const prompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!prompt) throw badRequest("prompt is required");
  const { width, height } = parseImageSize(payload.size);
  const seed = optionalIntegerFromUnknown(payload.seed);
  return {
    prompt,
    mode: "t2i",
    width,
    height,
    seed: seed === null ? 32 + index : seed + index,
  };
};

const extractSseFrames = (buffer: string): { frames: string[]; rest: string } => {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const frames: string[] = [];
  let start = 0;
  while (true) {
    const index = normalized.indexOf("\n\n", start);
    if (index === -1) break;
    frames.push(normalized.slice(start, index));
    start = index + 2;
  }
  return { frames, rest: normalized.slice(start) };
};

const dataLinesFromFrame = (frame: string): string[] =>
  frame
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());

const readHiDreamImage = async (response: Response): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) throw serviceUnavailable("HiDream image stream did not return a body");

  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const extracted = extractSseFrames(buffer);
      buffer = extracted.rest;
      for (const frame of extracted.frames) {
        for (const dataLine of dataLinesFromFrame(frame)) {
          const event = JSON.parse(dataLine) as Record<string, unknown>;
          if (event["type"] === "done" && typeof event["image"] === "string") {
            return event["image"];
          }
          if (event["type"] === "error") {
            throw serviceUnavailable(
              typeof event["message"] === "string" ? event["message"] : "HiDream generation failed"
            );
          }
        }
      }
    }
    if (done) break;
  }
  throw serviceUnavailable("HiDream image stream ended before returning an image");
};

const requestHiDreamImage = async (
  config: ImageGenerationConfig,
  payload: ImageGenerationPayload,
  index: number,
  signal: AbortSignal
): Promise<string> => {
  const startResponse = await fetch(buildHiDreamUrl(config.base_url, "/api/generate/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildHiDreamPayload(payload, index)),
    signal,
  });
  if (!startResponse.ok) {
    throw serviceUnavailable(`HiDream generation failed to start: HTTP ${startResponse.status}`);
  }
  const startPayload = (await startResponse.json()) as { job_id?: unknown };
  if (typeof startPayload.job_id !== "string" || !startPayload.job_id) {
    throw serviceUnavailable("HiDream generation did not return a job id");
  }

  const streamResponse = await fetch(
    buildHiDreamUrl(config.base_url, `/api/generate/stream/${startPayload.job_id}`),
    { signal }
  );
  if (!streamResponse.ok) {
    throw serviceUnavailable(`HiDream generation stream failed: HTTP ${streamResponse.status}`);
  }
  return readHiDreamImage(streamResponse);
};

const proxyOpenAIImageGeneration = async (
  config: ImageGenerationConfig,
  payload: ImageGenerationPayload,
  signal: AbortSignal
): Promise<Response> => {
  const body = {
    ...payload,
    model: typeof payload.model === "string" && payload.model.trim() ? payload.model : config.model,
  };
  const response = await fetch(buildOpenAIImageUrl(config.base_url), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.api_key ? { Authorization: `Bearer ${config.api_key}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });
  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("Content-Type") ?? "application/json",
    },
  });
};

const buildOpenAIImageResponse = (
  model: string,
  images: string[],
  responseFormat: unknown
): Record<string, unknown> => ({
  created: Math.floor(Date.now() / 1000),
  model,
  data: images.map((image) =>
    responseFormat === "url" ? { url: `data:image/png;base64,${image}` } : { b64_json: image }
  ),
});

export const registerImageGenerationRoutes = (app: Hono, context: AppContext): void => {
  app.post("/v1/images/generations", async (ctx) => {
    const config = context.config.image_generation;
    if (!config) {
      throw serviceUnavailable("Image generation backend is not configured");
    }

    let payload: ImageGenerationPayload;
    try {
      payload = (await ctx.req.json()) as ImageGenerationPayload;
    } catch {
      throw badRequest("Invalid JSON body");
    }

    const requestedModel = typeof payload.model === "string" ? payload.model.trim() : "";
    if (requestedModel && requestedModel !== config.model) {
      throw notFound(`Image model not managed: ${requestedModel}`);
    }

    if (config.adapter === "openai") {
      return proxyOpenAIImageGeneration(config, payload, ctx.req.raw.signal);
    }

    const count = positiveIntegerFromUnknown(payload.n, 1);
    const images: string[] = [];
    for (let index = 0; index < count; index += 1) {
      images.push(await requestHiDreamImage(config, payload, index, ctx.req.raw.signal));
    }

    return ctx.json(buildOpenAIImageResponse(config.model, images, payload.response_format));
  });
};
