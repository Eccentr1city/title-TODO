import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ICLOUD_DIR = path.join(
  process.env.HOME || "",
  "Library/Mobile Documents/com~apple~CloudDocs/title-TODO"
);
const FILTER_FILE = path.join(ICLOUD_DIR, "inbox-filter.json");

interface InboxFilter {
  mode: "blacklist" | "whitelist";
  listIds: string[];
}

function loadFilter(): InboxFilter {
  if (fs.existsSync(FILTER_FILE)) {
    return JSON.parse(fs.readFileSync(FILTER_FILE, "utf-8"));
  }
  return { mode: "blacklist", listIds: [] };
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
  const filter = (await request.json()) as InboxFilter;
  saveFilter(filter);
  return NextResponse.json(filter);
}
