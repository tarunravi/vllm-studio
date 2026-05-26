import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { modelsToPiModels, normalizeOpenAIModel } from "./models";

describe("agent model normalization", () => {
  it("marks image-generation models and omits them from Pi chat config", () => {
    const imageModel = normalizeOpenAIModel({
      id: "hidream-o1-image-dev",
      metadata: {
        capabilities: {
          image_generation: true,
          output: ["image"],
        },
      },
    });
    const chatModel = normalizeOpenAIModel({ id: "deepseek-v4-flash-ds4-native" });

    assert.equal(imageModel.imageGeneration, true);
    assert.deepEqual(
      modelsToPiModels([imageModel, chatModel]).map((model) => model.id),
      ["deepseek-v4-flash-ds4-native"],
    );
  });
});
