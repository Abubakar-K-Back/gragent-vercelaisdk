import { Args, Command, Flags } from '@oclif/core';
import { runAgent } from '../utils/agent.js';
import { LLMProvider } from '../utils/llm.js';
import chalk from 'chalk';

export default class Run extends Command {
  static description = 'Run an AI agent against a prompt using grapi MCP tools';

  static examples = [
    '<%= config.bin %> run "list all users" --mcp http://localhost:3333/mcp',
    '<%= config.bin %> run "create a report" --llm openai --model gpt-4o-mini --mcp http://localhost:3333/mcp',
    '<%= config.bin %> run "summarize data" --mcp http://localhost:3333/mcp --auth my-token --stream',
  ];

  static args = {
    prompt: Args.string({
      required: true,
      description: 'The task or question for the agent',
    }),
  };

  static flags = {
    llm: Flags.string({
      char: 'l',
      description: 'LLM provider to use',
      options: ['claude', 'openai', 'gemini'],
      default: 'claude',
    }),
    model: Flags.string({
      description: 'Specific model to use (overrides provider default)',
    }),
    mcp: Flags.string({
      char: 'm',
      description: 'MCP server URL',
    }),
    auth: Flags.string({
      char: 'a',
      description: 'Bearer token for MCP server authentication',
    }),
    steps: Flags.integer({
      char: 's',
      description: 'Maximum number of tool-use steps',
      default: 10,
    }),
    system: Flags.string({
      description: 'Custom system prompt for the agent',
    }),
    stream: Flags.boolean({
      description: 'Stream output token by token',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Run);
    const provider = flags.llm as LLMProvider;

    this.log(chalk.cyan(`\n🤖 Running agent (${provider}${flags.model ? `:${flags.model}` : ''})...`));
    if (flags.mcp) this.log(chalk.dim(`   MCP: ${flags.mcp}`));
    if (flags.stream) this.log(chalk.dim(`   Streaming: on`));
    this.log('');

    const result = await runAgent({
      prompt: args.prompt,
      provider,
      model: flags.model,
      mcpUrl: flags.mcp,
      auth: flags.auth,
      system: flags.system,
      maxSteps: flags.steps,
      streaming: flags.stream,
    });

    if (!flags.stream) {
      this.log(chalk.bold('--- Agent Output ---'));
      this.log(result);
    }
  }
}
