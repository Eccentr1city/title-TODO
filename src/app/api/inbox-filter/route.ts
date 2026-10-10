import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { DATA_DIR } from "@/lib/paths";
import { readJson, writeJson } from "@/lib/json-file";

const FILTER_FILE = path.join(DATA_DIR, "inbox-filter.json");

// Each mode keeps its own selection so switching between "Hide selected" and
// "Show only selected" doesn't clobber the other's list.
interface InboxFilter {
  mode: "blacklist" | "whitelist";
  blacklistIds: string[];
  whitelistIds: string[];
}

const DEFAULT_FILTER: InboxFilter = { mode: "blacklist", blacklistIds: [], whitelistIds: [] };

function loadFilter(): InboxFilter {
  const raw = readJson<Record<string, unknown> | null>(FILTER_FILE, null);
  if (!raw) return DEFAULT_FILTER;
  const mode = raw.mode === "whitelist" ? "whitelist" : "blacklist";
  // Migrate the old {mode, listIds} shape: assign listIds to the active mode
  if (Array.isArray(raw.listIds)) {
    return {
      mode,
      blacklistIds: mode === "blacklist" ? raw.listIds : [],
      whitelistIds: mode === "whitelist" ? raw.listIds : [],
    };
  }
  return {
    mode,
    blacklistIds: Array.isArray(raw.blacklistIds) ? raw.blacklistIds : [],
    whitelistIds: Array.isArray(raw.whitelistIds) ? raw.whitelistIds : [],
  };
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
  writeJson(FILTER_FILE, filter);
  return NextResponse.json(filter);
}
