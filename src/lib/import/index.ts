import { createHash } from "node:crypto";
import { parseFit } from "./fit";
import { parseGpx, parseTcx } from "./xml";
import { ImportError, type ParsedActivity } from "./types";

export type FileKind = "FILE_FIT" | "FILE_GPX" | "FILE_TCX";

export function detectKind(filename: string, buf: Buffer): FileKind {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "fit" || buf.subarray(8, 12).toString("ascii") === ".FIT") return "FILE_FIT";
  const head = buf.subarray(0, 2000).toString("utf8");
  if (ext === "gpx" || head.includes("<gpx")) return "FILE_GPX";
  if (ext === "tcx" || head.includes("TrainingCenterDatabase")) return "FILE_TCX";
  throw new ImportError(`Format non reconnu pour « ${filename} ». Formats acceptés : .fit, .gpx, .tcx.`);
}

export function parseActivityFile(filename: string, buf: Buffer): { kind: FileKind; parsed: ParsedActivity; hash: string } {
  const kind = detectKind(filename, buf);
  const parsed = kind === "FILE_FIT" ? parseFit(buf) : kind === "FILE_GPX" ? parseGpx(buf.toString("utf8")) : parseTcx(buf.toString("utf8"));
  if (!parsed.name) parsed.name = filename.replace(/\.[^.]+$/, "");
  return { kind, parsed, hash: createHash("sha256").update(buf).digest("hex") };
}

export { ImportError };
export type { ParsedActivity };
