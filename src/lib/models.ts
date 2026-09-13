// Shared by the model picker and server validation. Each model supports the
// Responses API and structured outputs; verified against OpenAI docs 2026-09-13.
export const OPENAI_MODELS = [
  {
    id: "chat-latest",
    label: "Chat Latest",
    description: "The latest Instant model used in ChatGPT.",
  },
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    description: "For cost-sensitive research questions and everyday tasks.",
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    description: "A balance of reasoning capability and cost.",
  },
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    description: "For complex professional work and research reasoning.",
  },
  {
    id: "gpt-6-astra",
    label: "GPT-6 Astra",
    description: "OpenAI's most capable model for demanding research tasks.",
  },
] as const;

export type OpenAIModelId = (typeof OPENAI_MODELS)[number]["id"];
export const OPENAI_MODEL_IDS = OPENAI_MODELS.map(({ id }) => id);
export const DEFAULT_OPENAI_MODEL: OpenAIModelId = "chat-latest";

export function isSupportedModel(value: unknown): value is OpenAIModelId {
  return OPENAI_MODELS.some(({ id }) => id === value);
}
