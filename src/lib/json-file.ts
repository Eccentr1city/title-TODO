import fs from "fs";

// Small JSON state files in DATA_DIR (inbox filter, Obsidian sync state).

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

// Write-then-rename, so a crash mid-write can't leave a truncated file that
// readJson would then treat as empty.
export function writeJson(file: string, value: unknown): void {
  const tmp = `${file}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, JSON.stringify(value, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}
