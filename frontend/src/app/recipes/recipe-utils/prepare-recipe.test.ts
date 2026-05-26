import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RecipeEditor } from "@/lib/types";
import { prepareRecipeForSave } from "./prepare-recipe";

const baseRecipe = (overrides: Partial<RecipeEditor> = {}): RecipeEditor => ({
  id: "r1",
  name: "Recipe",
  model_path: "/models/model",
  backend: "vllm",
  extra_args: {},
  ...overrides,
});

describe("prepareRecipeForSave", () => {
  it("does not persist vLLM-only editor fields as DS4 CLI arguments", () => {
    const prepared = prepareRecipeForSave(
      baseRecipe({
        backend: "ds4",
        tokenizer: "tokenizer",
        revision: "main",
        seed: 123,
        block_size: 256,
        enable_prefix_caching: true,
        thinking_budget: 4096,
        cuda_visible_devices: "0",
        extra_args: {
          tokenizer: "old-tokenizer",
          revision: "old-main",
          seed: 321,
          "block-size": 128,
          "enable-prefix-caching": true,
          default_chat_template_kwargs: { thinking_budget: 1024 },
          cuda_visible_devices: "1",
          cuda: true,
        },
      }),
    );

    assert.equal(prepared.extra_args?.["tokenizer"], undefined);
    assert.equal(prepared.extra_args?.["revision"], undefined);
    assert.equal(prepared.extra_args?.["seed"], undefined);
    assert.equal(prepared.extra_args?.["block-size"], undefined);
    assert.equal(prepared.extra_args?.["enable-prefix-caching"], undefined);
    assert.equal(prepared.extra_args?.["default_chat_template_kwargs"], undefined);
    assert.equal(prepared.extra_args?.["cuda-visible-devices"], "0");
    assert.equal(prepared.extra_args?.["cuda"], true);
  });
});
