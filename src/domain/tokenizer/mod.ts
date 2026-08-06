import init, { TokenizerBuilder } from "lindera-wasm-ipadic-web";
import type { TokenData } from "../types.ts";

let tokenizer: { tokenize: (text: string) => TokenData[] } | null = null;

export async function initTokenizer(wasmUrl?: string): Promise<void> {
  if (tokenizer) return;
  if (wasmUrl) {
    await init(wasmUrl);
  } else {
    await init();
  }
  const builder = new TokenizerBuilder();
  builder.setDictionary("embedded://ipadic");
  builder.setMode("normal");
  tokenizer = builder.build();
}

export function tokenize(text: string): TokenData[] {
  if (!tokenizer) {
    throw new Error("Tokenizer not initialized. Call initTokenizer() first.");
  }
  return tokenizer.tokenize(text) as TokenData[];
}

export function isInitialized(): boolean {
  return tokenizer !== null;
}
