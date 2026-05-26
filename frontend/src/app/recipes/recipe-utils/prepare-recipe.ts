// CRITICAL
import type { Recipe, RecipeEditor } from "@/lib/types";
import { EXTRA_ARG_FIELDS } from "./extra-arg-fields";
import {
  getCandidateKeys,
  getExtraArgValue,
  parseJsonObject,
  setExtraArgValue,
} from "./extra-args";

const DS4_EXTRA_ARG_FIELD_ALLOWLIST = new Set<keyof RecipeEditor>([
  "visible_devices",
  "cuda_visible_devices",
  "hip_visible_devices",
  "rocr_visible_devices",
]);

export const prepareRecipeForSave = (recipe: RecipeEditor): Recipe => {
  const payload: RecipeEditor = {
    ...recipe,
    extra_args: { ...(recipe.extra_args ?? {}) },
  };
  const extraArgs = payload.extra_args ?? {};
  const isDs4 = payload.backend === "ds4";

  if (payload.tensor_parallel_size === undefined && payload.tp !== undefined) {
    payload.tensor_parallel_size = payload.tp;
  }
  if (payload.pipeline_parallel_size === undefined && payload.pp !== undefined) {
    payload.pipeline_parallel_size = payload.pp;
  }

  for (const field of EXTRA_ARG_FIELDS) {
    const value = payload[field.field];
    if (isDs4 && !DS4_EXTRA_ARG_FIELD_ALLOWLIST.has(field.field)) {
      for (const key of getCandidateKeys(field)) {
        delete extraArgs[key];
      }
    } else if (value !== undefined) {
      setExtraArgValue(extraArgs, field, value);
    }
    delete (payload as unknown as Record<string, unknown>)[field.field];
  }

  const existingKwargs = parseJsonObject(
    getExtraArgValue(extraArgs, {
      key: "default-chat-template-kwargs",
      aliases: ["default_chat_template_kwargs"],
    }),
  );
  const updatedKwargs = { ...(existingKwargs ?? {}) };
  for (const key of getCandidateKeys({
    key: "default-chat-template-kwargs",
    aliases: ["default_chat_template_kwargs"],
  })) {
    delete extraArgs[key];
  }
  if (!isDs4 && payload.thinking_budget !== undefined && payload.thinking_budget !== null) {
    updatedKwargs["thinking_budget"] = payload.thinking_budget;
  } else {
    delete updatedKwargs["thinking_budget"];
  }
  if (!isDs4 && Object.keys(updatedKwargs).length > 0) {
    extraArgs["default_chat_template_kwargs"] = updatedKwargs;
  }

  if (payload.env_vars) {
    payload.env_vars = Object.fromEntries(
      Object.entries(payload.env_vars).map(([key, value]) => [key, String(value)]),
    );
  }

  delete (payload as unknown as Record<string, unknown>)["tp"];
  delete (payload as unknown as Record<string, unknown>)["pp"];
  delete (payload as unknown as Record<string, unknown>)["status"];
  delete (payload as unknown as Record<string, unknown>)["thinking_budget"];

  payload.extra_args = extraArgs;
  return payload;
};
