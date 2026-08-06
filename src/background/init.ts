import { initTokenizer } from "../domain/tokenizer/mod.ts";

const wasmUrl = chrome.runtime.getURL("wasm/lindera_wasm_bg.wasm");

export const tokenizerReady: Promise<void> = initTokenizer(wasmUrl).then(() => {
  console.log("[NQF] lindera-wasm initialized successfully");
}).catch((err) => {
  console.error("[NQF] WASM initialization failed:", err);
});
