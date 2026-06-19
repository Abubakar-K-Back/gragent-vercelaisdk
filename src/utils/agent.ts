import { generateText, streamText, stepCountIs } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { getLLM, LLMProvider } from './llm.js';
import chalk from 'chalk';

export interface RunAgentOptions {
  prompt: string;
  provider: LLMProvider;
  model?: string;
  apiKey?: string;
  mcpUrls?: string[];
  auth?: string;
  system?: string;
  maxSteps?: number;
  streaming?: boolean;
  verbose?: boolean;
}

export async function runAgent(options: RunAgentOptions): Promise<string> {
  const { prompt, provider, model, apiKey, mcpUrls = [], auth, system, maxSteps = 10, streaming = false, verbose = false } = options;

  const llm = getLLM(provider, model, apiKey);

  let tools: Record<string, unknown> | undefined;
  const mcpClients: Awaited<ReturnType<typeof createMCPClient>>[] = [];

  if (mcpUrls.length > 0) {
    // Connect to all MCP servers and merge their tools
    for (const url of mcpUrls) {
      const client = await createMCPClient({
        transport: {
          type: 'http',
          url,
          ...(auth ? { headers: { Authorization: `Bearer ${auth}` } } : {}),
        },
      });
      const serverTools = await client.tools();
      if (verbose) {
        console.log(chalk.dim(`  [MCP] ${url} → ${Object.keys(serverTools).length} tools`));
      }
      tools = { ...tools, ...serverTools };
      mcpClients.push(client);
    }
    if (verbose && mcpUrls.length > 1) {
      console.log(chalk.dim(`  [MCP] Total merged tools: ${Object.keys(tools ?? {}).length}\n`));
    }
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

  const onStepFinish = verbose
    ? (step: any) => {
        for (const call of step.toolCalls ?? []) {
          console.log(chalk.yellow(`\n⚙ Tool: ${chalk.bold(call.toolName)}`));
          console.log(chalk.dim(`  Args: ${JSON.stringify(call.args)}`));
        }
        for (const result of step.toolResults ?? []) {
          const preview = JSON.stringify(result.result).slice(0, 200);
          console.log(chalk.green(`  Result: ${preview}${preview.length >= 200 ? '...' : ''}`));
        }
      }
    : undefined;

  try {
    if (streaming) {
      const { textStream, steps } = streamText({
        model: llm,
        prompt,
        system: systemPrompt,
        tools: toolsParam,
        stopWhen: stopCondition,
        onStepFinish,
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
      const { text, steps } = await generateText({
        model: llm,
        prompt,
        system: systemPrompt,
        tools: toolsParam,
        stopWhen: stopCondition,
        onStepFinish,
      });
      if (verbose) {
        console.log(chalk.dim(`\n(completed in ${steps.length} steps)\n`));
      }
      return text;
    }
  } finally {
    await Promise.all(mcpClients.map(c => c.close()));
  }
}
