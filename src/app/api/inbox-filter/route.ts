import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ICLOUD_DIR = path.join(
  process.env.HOME || "",
  "Library/Mobile Documents/com~apple~CloudDocs/title-TODO"
);
const FILTER_FILE = path.join(ICLOUD_DIR, "inbox-filter.json");

// Each mode keeps its own selection so switching between "Hide selected" and
// "Show only selected" doesn't clobber the other's list.
interface InboxFilter {
  mode: "blacklist" | "whitelist";
  blacklistIds: string[];
  whitelistIds: string[];
}

const DEFAULT_FILTER: InboxFilter = { mode: "blacklist", blacklistIds: [], whitelistIds: [] };

function loadFilter(): InboxFilter {
  if (!fs.existsSync(FILTER_FILE)) return DEFAULT_FILTER;
  try {
    const raw = JSON.parse(fs.readFileSync(FILTER_FILE, "utf-8"));
    // Migrate the old {mode, listIds} shape: assign listIds to the active mode
    if (Array.isArray(raw.listIds)) {
      return {
        mode: raw.mode === "whitelist" ? "whitelist" : "blacklist",
        blacklistIds: raw.mode === "blacklist" ? raw.listIds : [],
        whitelistIds: raw.mode === "whitelist" ? raw.listIds : [],
      };
    }
    return {
      mode: raw.mode === "whitelist" ? "whitelist" : "blacklist",
      blacklistIds: Array.isArray(raw.blacklistIds) ? raw.blacklistIds : [],
      whitelistIds: Array.isArray(raw.whitelistIds) ? raw.whitelistIds : [],
    };
  } catch {
    return DEFAULT_FILTER;
  }
}

function saveFilter(filter: InboxFilter) {
  if (!fs.existsSync(ICLOUD_DIR)) {
    fs.mkdirSync(ICLOUD_DIR, { recursive: true });
  }
  fs.writeFileSync(FILTER_FILE, JSON.stringify(filter, null, 2));
}

export async function GET() {
  return NextResponse.json(loadFilter());
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const filter: InboxFilter = {
    mode: body.mode === "whitelist" ? "whitelist" : "blacklist",
    blacklistIds: Array.isArray(body.blacklistIds) ? body.blacklistIds : [],
    whitelistIds: Array.isArray(body.whitelistIds) ? body.whitelistIds : [],
  };
  saveFilter(filter);
  return NextResponse.json(filter);
}
