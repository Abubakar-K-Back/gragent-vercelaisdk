import { generateText, streamText, stepCountIs } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { getLLM, LLMProvider } from './llm.js';

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

export async function runAgent(options: RunAgentOptions): Promise<string> {
  const { prompt, provider, model, mcpUrl, auth, system, maxSteps = 10, streaming = false } = options;

  const llm = getLLM(provider, model);

  let tools: Record<string, unknown> | undefined;
  let mcp: Awaited<ReturnType<typeof createMCPClient>> | undefined;

  if (mcpUrl) {
    mcp = await createMCPClient({
      transport: {
        type: 'http',
        url: mcpUrl,
        ...(auth ? { headers: { Authorization: `Bearer ${auth}` } } : {}),
      },
    });
    tools = await mcp.tools();
  }

  const systemPrompt = system ?? 'You are a helpful AI agent. Use the available tools to complete tasks.';
  const stopCondition = stepCountIs(maxSteps);
  const toolsParam = tools as Parameters<typeof generateText>[0]['tools'];

  try {
    if (streaming) {
      const { textStream, steps } = streamText({
        model: llm,
        prompt,
        system: systemPrompt,
        tools: toolsParam,
        stopWhen: stopCondition,
      });

      let full = '';
      for await (const chunk of textStream) {
        process.stdout.write(chunk);
        full += chunk;
      }
      process.stdout.write('\n');
      const resolvedSteps = await steps;
      process.stdout.write(`\n(completed in ${resolvedSteps.length} steps)\n`);
      return full;
    } else {
      const { text } = await generateText({
        model: llm,
        prompt,
        system: systemPrompt,
        tools: toolsParam,
        stopWhen: stopCondition,
      });
      return text;
    }
  } finally {
    await mcp?.close();
  }
}
