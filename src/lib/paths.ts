import fs from "fs";
import path from "path";

// Where todos.db and the JSON state files live: $TITLE_TODO_DATA_DIR if set,
// else the iCloud folder (the original Mac setup), else ./data.
const icloudDir = path.join(
  process.env.HOME || "",
  "Library/Mobile Documents/com~apple~CloudDocs/title-TODO"
);
export const DATA_DIR =
  process.env.TITLE_TODO_DATA_DIR ||
  (fs.existsSync(icloudDir) ? icloudDir : path.join(process.cwd(), "data"));
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
