import init from "lindera-wasm-ipadic-web";

async function initializeWasm(): Promise<void> {
  const wasmUrl = chrome.runtime.getURL("wasm/lindera_wasm_bg.wasm");
  await init(wasmUrl);
  console.log("[NQF] lindera-wasm initialized successfully");
}

self.addEventListener("install", () => {
  console.log("[NQF] Service Worker installed");
});

self.addEventListener("activate", () => {
  console.log("[NQF] Service Worker activated");
  initializeWasm().catch((err) => {
    console.error("[NQF] WASM initialization failed:", err);
  });
});
