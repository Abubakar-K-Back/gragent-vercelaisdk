import { Args, Command, Flags } from '@oclif/core';
import { runAgent } from '../utils/agent.js';
import { LLMProvider } from '../utils/llm.js';
import chalk from 'chalk';

export default class Pipeline extends Command {
  static description = 'Run multiple agents in sequence, each receiving the previous output via {{output}}';

  static examples = [
    '<%= config.bin %> pipeline "get all customers and return their IDs" "for each customer ID in {{output}} get their contacts" --mcp http://localhost:3000/mcp/acelink-mcp',
    '<%= config.bin %> pipeline "list all NY addresses" "summarize this data: {{output}}" --llm gemini --api-key YOUR_KEY --mcp http://localhost:3000/mcp/acelink-mcp',
  ];

  static strict = false;

  static args = {
    prompts: Args.string({
      required: true,
      description: 'First prompt in the pipeline',
    }),
  };

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
      description: 'Maximum steps per agent',
      default: 10,
    }),
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show each tool call and result as it happens',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(Pipeline);
    const provider = flags.llm as LLMProvider;
    const mcpUrls = flags.mcp ?? [];

    // All positional args are prompts
    const prompts = argv as string[];

    if (prompts.length < 2) {
      this.error('Pipeline requires at least 2 prompts');
    }

    this.log(chalk.cyan(`\n🔗 Running pipeline (${prompts.length} agents)...\n`));

    let output = '';

    for (let i = 0; i < prompts.length; i++) {
      const prompt = prompts[i].replaceAll('{{output}}', output);

      this.log(chalk.cyan(`── Agent ${i + 1}/${prompts.length} ──────────────────────`));
      this.log(chalk.dim(`   Prompt: ${prompt.slice(0, 100)}${prompt.length > 100 ? '...' : ''}\n`));

      output = await runAgent({
        prompt,
        provider,
        model: flags.model,
        apiKey: flags['api-key'],
        mcpUrls,
        auth: flags.auth,
        maxSteps: flags.steps,
        verbose: flags.verbose,
      });

      this.log(chalk.bold(`\n   Output:`));
      this.log(output);
      this.log('');
    }

    this.log(chalk.green('\n✓ Pipeline complete'));
  }
}
