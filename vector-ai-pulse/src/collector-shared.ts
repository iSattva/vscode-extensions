import * as fs from "fs";

export function walk(dir: string, out: string[], matches: (name: string) => boolean): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(full, out, matches);
    else if (entry.isFile() && matches(entry.name)) out.push(full);
  }
}

export interface NewLinesResult {
  lines: string[];
}

// Splits on raw bytes (0x0a), not the decoded string, so multi-byte UTF-8
// content never throws off the byte offset persisted in fileOffsets - '\n'
// can't appear as a continuation byte in valid UTF-8, so this is safe.
// Mutates fileOffsets[filePath] in place; callers save the store themselves.
// Shared by any tool whose local session log is append-only JSONL (Claude
// Code, Codex) - tools that instead rewrite a single JSON snapshot file
// (Cline's taskHistory.json) need whole-file diffing, not this.
export function readNewLines(fileOffsets: Record<string, number>, filePath: string): NewLinesResult {
  const priorOffset = fileOffsets[filePath] ?? 0;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return { lines: [] };
  }

  // File truncated or rotated out from under us - restart from the top;
  // callers dedup by message/record id to avoid double-counting anything
  // already recorded.
  const start = priorOffset > stat.size ? 0 : priorOffset;
  if (start >= stat.size) return { lines: [] };

  const fd = fs.openSync(filePath, "r");
  const length = stat.size - start;
  const buf = Buffer.alloc(length);
  fs.readSync(fd, buf, 0, length, start);
  fs.closeSync(fd);

  let pos = 0;
  let consumed = 0;
  const lines: string[] = [];

  while (true) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl === -1) break; // partial trailing line (still being written) - held back for next pass
    const line = buf.toString("utf8", pos, nl).trim();
    pos = nl + 1;
    consumed = pos;
    if (line) lines.push(line);
  }

  fileOffsets[filePath] = start + consumed;
  return { lines };
}
