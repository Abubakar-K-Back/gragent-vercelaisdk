import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { openai, createOpenAI } from '@ai-sdk/openai';
import { google, createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';

export type LLMProvider = 'claude' | 'openai' | 'gemini' | 'groq';

const DEFAULTS: Record<LLMProvider, string> = {
  claude: 'claude-opus-4-6',
  openai: 'gpt-4o',
  gemini: 'gemini-2.5-flash',
  groq: 'llama-3.3-70b-versatile',
};

export function getLLM(provider: LLMProvider, model?: string, apiKey?: string) {
  const m = model ?? DEFAULTS[provider];
  switch (provider) {
    case 'claude':
      return apiKey ? createAnthropic({ apiKey })(m) : anthropic(m);
    case 'openai':
      return apiKey ? createOpenAI({ apiKey })(m) : openai(m);
    case 'gemini':
      return apiKey ? createGoogleGenerativeAI({ apiKey })(m) : google(m);
    case 'groq':
      return createGroq({ apiKey: apiKey ?? process.env.GROQ_API_KEY })(m);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
