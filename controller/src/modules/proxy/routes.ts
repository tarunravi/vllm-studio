import type { Hono } from "hono";
import type { AppContext } from "../../types/context";
import { registerImageGenerationRoutes } from "./image-routes";
import { registerOpenAIRoutes } from "./openai-routes";
import { registerTokenizationRoutes } from "./tokenization-routes";

/**
 * Register all proxy module routes (OpenAI proxy, tokenization).
 * @param app - Hono app.
 * @param context - App context.
 */
export const registerAllProxyRoutes = (app: Hono, context: AppContext): void => {
  registerOpenAIRoutes(app, context);
  registerImageGenerationRoutes(app, context);
  registerTokenizationRoutes(app, context);
};
