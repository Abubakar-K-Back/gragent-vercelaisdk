import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

export type LLMProvider = 'claude' | 'openai' | 'gemini';

const DEFAULTS: Record<LLMProvider, string> = {
  claude: 'claude-opus-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-1.5-pro',
};

export function getLLM(provider: LLMProvider, model?: string) {
  const m = model ?? DEFAULTS[provider];
  switch (provider) {
    case 'claude':
      return anthropic(m);
    case 'openai':
      return openai(m);
    case 'gemini':
      return google(m);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
