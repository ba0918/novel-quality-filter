// tmpfile + rename パターンで書き込みを atomic にする。write 中のプロセス強制終了・電源断で、
// 元ファイルが半端に上書きされて欠損・不正 JSON になるのを防ぐ（labels.jsonl や cal.json が
// これで壊れると較正データを人手で作り直すことになるため、書き込み経路の副作用として払う）。
// POSIX 上 rename は同一ファイルシステム内で atomic — tmp は path と同じディレクトリに置く。

export async function atomicWriteText(path: string, content: string): Promise<void> {
  const tmp = `${path}.tmp.${crypto.randomUUID()}`;
  try {
    await Deno.writeTextFile(tmp, content);
    await Deno.rename(tmp, path);
  } catch (e) {
    // rename 失敗などで tmp が残ることがある。残骸を残さないよう best-effort で消す
    // （消せない事情があってもオリジナルエラーを優先して投げる）。
    try {
      await Deno.remove(tmp);
    } catch { /* ignore */ }
    throw e;
  }
}
