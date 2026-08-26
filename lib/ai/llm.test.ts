import assert from "node:assert/strict";
import test from "node:test";

import {
  getTranslationRoute,
  TRANSLATION_DEFAULT_BASE_URL,
  TRANSLATION_DEFAULT_MODEL,
} from "./llm";

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => void,
): void {
  const previous = new Map<string, string | undefined>();
  for (const [name, value] of Object.entries(values)) {
    previous.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    fn();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("translation route is opt-in and uses the GLM defaults", () => {
  withEnv(
    {
      TRANSLATION_API_KEY: undefined,
      XKOOL_API_KEY: undefined,
      TRANSLATION_BASE_URL: undefined,
      TRANSLATION_MODEL: undefined,
    },
    () => {
      assert.equal(getTranslationRoute(), null);
    },
  );

  withEnv(
    {
      TRANSLATION_API_KEY: "translation-test-key",
      XKOOL_API_KEY: undefined,
      TRANSLATION_BASE_URL: undefined,
      TRANSLATION_MODEL: undefined,
    },
    () => {
      assert.deepEqual(getTranslationRoute(), {
        backend: "openai",
        apiKey: "translation-test-key",
        baseUrl: TRANSLATION_DEFAULT_BASE_URL,
        model: TRANSLATION_DEFAULT_MODEL,
        reasoningEffort: "none",
      });
    },
  );
});


test("translation route accepts explicit endpoint and model overrides", () => {
  withEnv(
    {
      TRANSLATION_API_KEY: undefined,
      XKOOL_API_KEY: "xkool-test-key",
      TRANSLATION_BASE_URL: "https://translation.example.test/v1",
      TRANSLATION_MODEL: "glm-5.2-custom",
    },
    () => {
      assert.deepEqual(getTranslationRoute(), {
        backend: "openai",
        apiKey: "xkool-test-key",
        baseUrl: "https://translation.example.test/v1",
        model: "glm-5.2-custom",
        reasoningEffort: "none",
      });
    },
  );
});
