import { generateText, streamText, stepCountIs } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { getLLM, LLMProvider } from './llm.js';

export interface RunAgentOptions {
  prompt: string;
  provider: LLMProvider;
  model?: string;
  apiKey?: string;
  mcpUrl?: string;
  auth?: string;
  system?: string;
  maxSteps?: number;
  streaming?: boolean;
}

export async function runAgent(options: RunAgentOptions): Promise<string> {
  const { prompt, provider, model, apiKey, mcpUrl, auth, system, maxSteps = 10, streaming = false } = options;

  const llm = getLLM(provider, model, apiKey);

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

  const systemPrompt = system ?? `You are a helpful AI agent. Use the available tools to complete tasks.
Tool naming convention: tools follow the pattern <method>_<resource>. For example:
- get_customers → GET /customers (lists ALL customers, no parameters needed)
- get_customers-by-id → GET /customers/{id} (requires an id)
- post_customers → POST /customers (create a customer)
- get_customers-count → GET /customers/count (returns count only)
Always prefer the simplest tool that answers the question. To list all resources, use get_<resource> with no parameters.`;
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
