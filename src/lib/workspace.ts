import type { Hypothesis, Note } from "./types";
import { redactCredentials } from "./credentials";

export { redactCredentials } from "./credentials";

export type Workspace = {
  version: 1;
  hypotheses: Hypothesis[];
  saved: string[];
  papers: string[];
  notes: Note[];
};

export const STORAGE_KEY = "patheon-workspace-v1";
export const initialWorkspace: Workspace = {
  version: 1,
  hypotheses: [],
  saved: [],
  papers: [],
  notes: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanWorkspace(value: unknown, sensitiveKey?: string): Workspace {
  if (!isRecord(value) || value.version !== 1) return initialWorkspace;
  const clean = (text: string) => redactCredentials(text, sensitiveKey);
  const strings = (items: unknown) =>
    Array.isArray(items)
      ? items
          .filter((item): item is string => typeof item === "string")
          .map(clean)
      : [];
  const hypotheses: Hypothesis[] = [];
  for (const item of Array.isArray(value.hypotheses) ? value.hypotheses : []) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.summary !== "string" ||
      typeof item.domain !== "string" ||
      typeof item.rationale !== "string" ||
      typeof item.limitations !== "string" ||
      typeof item.createdAt !== "string" ||
      typeof item.source !== "string" ||
      !["example", "gemini", "openai"].includes(item.source) ||
      !Array.isArray(item.methodology) ||
      !item.methodology.every((step) => typeof step === "string")
    )
      continue;
    // Deliberately copy known fields. Never spread provider or stored objects.
    hypotheses.push({
      id: clean(item.id),
      title: clean(item.title),
      summary: clean(item.summary),
      domain: clean(item.domain),
      rationale: clean(item.rationale),
      methodology: strings(item.methodology),
      limitations: clean(item.limitations),
      source: item.source as Hypothesis["source"],
      createdAt: clean(item.createdAt),
    });
  }
  const notes: Note[] = [];
  for (const item of Array.isArray(value.notes) ? value.notes : []) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      typeof item.title !== "string" ||
      typeof item.body !== "string" ||
      typeof item.updatedAt !== "string"
    )
      continue;
    notes.push({
      id: clean(item.id),
      title: clean(item.title),
      body: clean(item.body),
      updatedAt: clean(item.updatedAt),
    });
  }
  return {
    version: 1,
    hypotheses,
    saved: strings(value.saved),
    papers: strings(value.papers),
    notes,
  };
}

export function readWorkspace(storage?: Pick<Storage, "getItem">): Workspace {
  try {
    return cleanWorkspace(
      JSON.parse((storage ?? localStorage).getItem(STORAGE_KEY) || "null"),
    );
  } catch {
    return initialWorkspace;
  }
}

/** This is the only representation approved for workspace storage and export. */
export function serializeWorkspace(
  workspace: Workspace,
  sensitiveKey?: string,
): string {
  return JSON.stringify(cleanWorkspace(workspace, sensitiveKey));
}
