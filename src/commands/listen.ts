import { Command, Flags } from '@oclif/core';
import { Kafka, logLevel } from 'kafkajs';
import { runAgent } from '../utils/agent.js';
import { LLMProvider } from '../utils/llm.js';
import chalk from 'chalk';

export default class Listen extends Command {
  static description = 'Listen on a Kafka topic for agent tasks and publish results back';

  static examples = [
    '<%= config.bin %> listen --broker localhost:9092 --input agent-tasks --output agent-results --mcp http://localhost:3000/mcp/acelink-mcp',
    '<%= config.bin %> listen --broker localhost:9092 --input agent-tasks --output agent-results --mcp http://localhost:3000/mcp/acelink-mcp --llm gemini --api-key YOUR_KEY',
  ];

  static flags = {
    broker: Flags.string({
      char: 'b',
      description: 'Kafka broker address',
      default: 'localhost:9092',
    }),
    input: Flags.string({
      char: 'i',
      description: 'Kafka topic to consume agent tasks from',
      default: 'agent-tasks',
    }),
    output: Flags.string({
      char: 'o',
      description: 'Kafka topic to publish agent results to',
      default: 'agent-results',
    }),
    'group-id': Flags.string({
      description: 'Kafka consumer group ID',
      default: 'gragent-consumers',
    }),
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
      description: 'Default MCP server URL (can be overridden per message)',
      multiple: true,
    }),
    auth: Flags.string({
      char: 'a',
      description: 'Bearer token for MCP server authentication',
    }),
    steps: Flags.integer({
      char: 's',
      description: 'Maximum steps per agent run',
      default: 10,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show tool calls as they happen',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Listen);
    const provider = flags.llm as LLMProvider;
    const defaultMcpUrls = flags.mcp ?? [];

    const kafka = new Kafka({
      clientId: 'gragent',
      brokers: [flags.broker],
      logLevel: logLevel.ERROR,
    });

    const consumer = kafka.consumer({ groupId: flags['group-id'] });
    const producer = kafka.producer();

    await consumer.connect();
    await producer.connect();
    await consumer.subscribe({ topic: flags.input, fromBeginning: false });

    this.log(chalk.cyan(`\n🎧 gragent listening on Kafka`));
    this.log(chalk.dim(`   Broker:  ${flags.broker}`));
    this.log(chalk.dim(`   Input:   ${flags.input}`));
    this.log(chalk.dim(`   Output:  ${flags.output}`));
    this.log(chalk.dim(`   LLM:     ${provider}${flags.model ? `:${flags.model}` : ''}`));
    if (defaultMcpUrls.length) this.log(chalk.dim(`   MCPs:    ${defaultMcpUrls.join(', ')}`));
    this.log(chalk.dim(`   Press Ctrl+C to stop\n`));

    const cleanup = async () => {
      await consumer.disconnect();
      await producer.disconnect();
    };

    process.on('SIGINT', async () => {
      this.log(chalk.dim('\nShutting down...'));
      await cleanup();
      process.exit(0);
    });

    await consumer.run({
      eachMessage: async ({ message }) => {
        const raw = message.value?.toString();
        if (!raw) return;

        let taskId: string;
        let prompt: string;
        let mcpUrls: string[];

        try {
          const payload = JSON.parse(raw);
          taskId = payload.taskId ?? `task-${Date.now()}`;
          prompt = payload.prompt;
          mcpUrls = payload.mcp
            ? Array.isArray(payload.mcp) ? payload.mcp : [payload.mcp]
            : defaultMcpUrls;

          if (!prompt) {
            this.log(chalk.red(`[${taskId}] Missing 'prompt' in message, skipping`));
            return;
          }
        } catch {
          this.log(chalk.red(`Failed to parse message: ${raw.slice(0, 100)}`));
          return;
        }

        this.log(chalk.cyan(`[${taskId}] Running agent...`));
        this.log(chalk.dim(`  Prompt: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}`));

        const startedAt = Date.now();

        try {
          const result = await runAgent({
            prompt,
            provider,
            model: flags.model,
            apiKey: flags['api-key'],
            mcpUrls,
            auth: flags.auth,
            maxSteps: flags.steps,
            verbose: flags.verbose,
          });

          const durationMs = Date.now() - startedAt;
          this.log(chalk.green(`[${taskId}] Done in ${durationMs}ms`));

          await producer.send({
            topic: flags.output,
            messages: [{
              key: taskId,
              value: JSON.stringify({
                taskId,
                status: 'success',
                result,
                durationMs,
                prompt,
              }),
            }],
          });
        } catch (err: any) {
          const durationMs = Date.now() - startedAt;
          this.log(chalk.red(`[${taskId}] Failed: ${err?.message ?? String(err)}`));

          await producer.send({
            topic: flags.output,
            messages: [{
              key: taskId,
              value: JSON.stringify({
                taskId,
                status: 'error',
                error: err?.message ?? String(err),
                durationMs,
                prompt,
              }),
            }],
          });
        }
      },
    });

    // Keep process alive
    await new Promise(() => {});
  }
}
