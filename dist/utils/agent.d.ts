import { LLMProvider } from './llm.js';
export interface RunAgentOptions {
    prompt: string;
    provider: LLMProvider;
    model?: string;
    mcpUrl?: string;
    auth?: string;
    system?: string;
    maxSteps?: number;
    streaming?: boolean;
}
export declare function runAgent(options: RunAgentOptions): Promise<string>;
//# sourceMappingURL=agent.d.ts.map