import { Command, Flags } from '@oclif/core';
import { generateText, stepCountIs } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { getLLM, LLMProvider } from '../utils/llm.js';
import { loadConfig } from '../utils/config.js';
import chalk from 'chalk';
import * as readline from 'node:readline';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

type Message = { role: 'user' | 'assistant'; content: string };

export default class Chat extends Command {
  static description = 'Start an interactive chat session with memory — the agent remembers your full conversation';

  static examples = [
    '<%= config.bin %> chat --llm gemini --api-key YOUR_KEY --mcp http://localhost:3000/mcp/acelink-mcp',
    '<%= config.bin %> chat --llm gemini --api-key YOUR_KEY --mcp http://localhost:3000/mcp/acelink-mcp --save session.json',
    '<%= config.bin %> chat --llm gemini --api-key YOUR_KEY --mcp http://localhost:3000/mcp/acelink-mcp --load session.json',
  ];

  static flags = {
    llm: Flags.string({
      char: 'l',
      description: 'LLM provider to use',
      options: ['claude', 'openai', 'gemini', 'groq'],
      default: 'claude',
    }),
    model: Flags.string({
      description: 'Specific model to use',
    }),
    'api-key': Flags.string({
      char: 'k',
      description: 'API key for the LLM provider',
    }),
    mcp: Flags.string({
      char: 'm',
      description: 'MCP server URL (can be specified multiple times)',
      multiple: true,
    }),
    auth: Flags.string({
      char: 'a',
      description: 'Bearer token for MCP server authentication',
    }),
    steps: Flags.integer({
      char: 's',
      description: 'Maximum steps per turn',
      default: 10,
    }),
    system: Flags.string({
      description: 'Custom system prompt',
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show each tool call and result as it happens',
      default: false,
    }),
    save: Flags.string({
      description: 'Save conversation history to a JSON file on exit',
    }),
    load: Flags.string({
      description: 'Load and resume a previous conversation from a JSON file',
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to a gragent config file (default: gragent.config.json)',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Chat);

    const cfg = loadConfig(flags.config);
    const provider = (flags.llm !== 'claude' ? flags.llm : cfg.llm ?? flags.llm) as LLMProvider;
    const apiKey = flags['api-key'] ?? cfg.apiKey;
    const model = flags.model ?? cfg.model;
    const auth = flags.auth ?? cfg.auth;
    const system = flags.system ?? cfg.system;
    const steps = flags.steps !== 10 ? flags.steps : cfg.steps ?? flags.steps;
    const verbose = flags.verbose || (cfg.verbose ?? false);
    const mcpUrls = flags.mcp?.length ? flags.mcp : cfg.mcps ?? [];

    const llm = getLLM(provider, model, apiKey);

    // Connect to all MCP servers
    const mcpClients: Awaited<ReturnType<typeof createMCPClient>>[] = [];
    let tools: Record<string, unknown> | undefined;

    if (mcpUrls.length > 0) {
      for (const url of mcpUrls) {
        const client = await createMCPClient({
          transport: {
            type: 'http',
            url,
            ...(auth ? { headers: { Authorization: `Bearer ${auth}` } } : {}),
          },
        });
        const serverTools = await client.tools();
        tools = { ...tools, ...serverTools };
        mcpClients.push(client);
      }
    }

    const systemPrompt = system ?? `You are a helpful AI agent. Use the available tools to complete tasks.
Tool naming convention: tools follow the pattern <method>_<resource>. For example:
- get_customers → GET /customers (lists ALL customers, no parameters needed)
- get_customers-by-id → GET /customers/{id} (requires an id)
- post_customers → POST /customers (create a customer)
- get_customers-count → GET /customers/count (returns count only)
Always prefer the simplest tool that answers the question. To list all resources, use get_<resource> with no parameters.`;

    // Load history from file if --load provided
    let messages: Message[] = [];
    if (flags.load && existsSync(flags.load)) {
      messages = JSON.parse(readFileSync(flags.load, 'utf-8'));
      this.log(chalk.dim(`Loaded ${messages.length} messages from ${flags.load}`));
    }

    // Print header
    this.log(chalk.cyan(`\n🤖 gragent chat (${provider}${model ? `:${model}` : ''})`));
    if (mcpUrls.length) this.log(chalk.dim(`   MCPs: ${mcpUrls.join(', ')}`));
    if (tools) this.log(chalk.dim(`   Tools: ${Object.keys(tools).length} available`));
    this.log(chalk.dim(`   Type "exit" or press Ctrl+C to quit`));
    if (flags.save) this.log(chalk.dim(`   Session will be saved to: ${flags.save}`));
    this.log('');

    // Print existing history if resuming
    if (messages.length > 0) {
      this.log(chalk.dim('── Resuming conversation ──────────────────────\n'));
      for (const msg of messages) {
        if (msg.role === 'user') {
          this.log(chalk.bold.blue('You: ') + msg.content);
        } else {
          this.log(chalk.bold.green('Agent: ') + msg.content);
        }
        this.log('');
      }
      this.log(chalk.dim('── Continue from here ─────────────────────────\n'));
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const save = () => {
      if (flags.save && messages.length > 0) {
        writeFileSync(flags.save, JSON.stringify(messages, null, 2));
        this.log(chalk.dim(`\nSession saved to ${flags.save}`));
      }
    };

    const cleanup = async () => {
      save();
      rl.close();
      await Promise.all(mcpClients.map(c => c.close()));
    };

    process.on('SIGINT', async () => {
      this.log('');
      await cleanup();
      process.exit(0);
    });

    const toolsParam = tools as Parameters<typeof generateText>[0]['tools'];

    const ask = () => {
      rl.question(chalk.bold.blue('You: '), async (input) => {
        const userInput = input.trim();

        if (!userInput) return ask();
        if (userInput.toLowerCase() === 'exit') {
          await cleanup();
          process.exit(0);
        }
        if (userInput.toLowerCase() === 'clear') {
          messages = [];
          this.log(chalk.dim('Conversation cleared.\n'));
          return ask();
        }
        if (userInput.toLowerCase() === 'history') {
          this.log(chalk.dim(`\n${messages.length} messages in history\n`));
          return ask();
        }

        messages.push({ role: 'user', content: userInput });

        try {
          const response = await generateText({
            model: llm,
            system: systemPrompt,
            messages,
            tools: toolsParam,
            stopWhen: stepCountIs(steps),
            onStepFinish: verbose
              ? (step: any) => {
                  for (const call of step.toolCalls ?? []) {
                    this.log(chalk.yellow(`\n  ⚙ ${chalk.bold(call.toolName)} ${chalk.dim(JSON.stringify(call.args))}`));
                  }
                  for (const result of step.toolResults ?? []) {
                    const preview = JSON.stringify(result.result).slice(0, 150);
                    this.log(chalk.green(`    → ${preview}${preview.length >= 150 ? '...' : ''}`));
                  }
                }
              : undefined,
          });

          // Append full response messages (includes tool calls/results) for proper memory.
          // Use response.steps to collect ALL assistant + tool messages across every step.
          const allResponseMessages: Message[] = [];
          for (const step of response.steps) {
            allResponseMessages.push(...(step.response.messages as unknown as Message[]));
          }
          if (allResponseMessages.length) {
            messages.push(...allResponseMessages);
          } else {
            messages.push({ role: 'assistant', content: response.text });
          }

          if (verbose) {
            this.log(chalk.dim(`  [memory] ${messages.length} messages in context`));
          }

          if (verbose) {
            this.log(chalk.dim(`\n(${response.steps.length} steps)\n`));
          }

          this.log(chalk.bold.green('\nAgent: ') + response.text + '\n');
        } catch (err: any) {
          this.log(chalk.red(`\nError: ${err?.message ?? String(err)}\n`));
          // Remove the failed user message from history
          messages = messages.slice(0, -1);
        }

        ask();
      });
    };

    ask();
  }
}
