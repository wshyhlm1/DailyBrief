import assert from "node:assert/strict";
import test from "node:test";

import {
  isTransientOpenAICompatError,
  transientRetryDelayMs,
  withTransientRetries,
} from "./openai-compat";


test("transient Qwen connection failures use bounded exponential backoff", async () => {
  const delays: number[] = [];
  let attempts = 0;
  const value = await withTransientRetries(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("Connection error: fetch failed") as Error & { code: string };
        error.code = "ETIMEDOUT";
        throw error;
      }
      return "ok";
    },
    {
      maxAttempts: 4,
      baseDelayMs: 2_000,
      maxDelayMs: 3_000,
      sleep: async (delayMs) => { delays.push(delayMs); },
    },
  );

  assert.equal(value, "ok");
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [2_000, 3_000]);
  assert.equal(transientRetryDelayMs(4, 2_000, 5_000), 5_000);
});


test("authentication and request errors fail immediately", async () => {
  let attempts = 0;
  await assert.rejects(
    withTransientRetries(
      async () => {
        attempts += 1;
        throw Object.assign(new Error("Unauthorized"), { status: 401 });
      },
      {
        maxAttempts: 4,
        baseDelayMs: 1,
        maxDelayMs: 2,
        sleep: async () => { throw new Error("sleep must not run"); },
      },
    ),
    /Unauthorized/,
  );
  assert.equal(attempts, 1);
  assert.equal(isTransientOpenAICompatError({ status: 429 }), true);
  assert.equal(isTransientOpenAICompatError({ status: 400 }), false);
});
