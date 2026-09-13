import type { OpenAIModelId } from "./models";

export type OrbitalId = "1s" | "2p" | "3d";
export type ResearchMode = "hypothesis" | "assistant";
export type Hypothesis = {
  id: string;
  title: string;
  summary: string;
  domain: string;
  rationale: string;
  methodology: string[];
  limitations: string;
  // Keep Gemini provenance when opening research saved before the migration.
  source: "example" | "gemini" | "openai";
  createdAt: string;
};
export type ResearchRequest = {
  mode: ResearchMode;
  prompt: string;
  model?: OpenAIModelId;
  orbital?: OrbitalId;
  history?: { role: "user" | "assistant"; content: string }[];
};
export type ResearchResponse = {
  source: "openai";
  message?: string;
  hypotheses?: Hypothesis[];
};
export type Note = {
  id: string;
  title: string;
  body: string;
  updatedAt: string;
};
