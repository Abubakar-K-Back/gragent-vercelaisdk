import { Args, Command, Flags } from '@oclif/core';
import { runAgent } from '../utils/agent.js';
import { LLMProvider } from '../utils/llm.js';
import { loadConfig } from '../utils/config.js';
import chalk from 'chalk';

export default class Run extends Command {
  static description = 'Run an AI agent against a prompt using MCP tools';

  static examples = [
    '<%= config.bin %> run "list all customers" --mcp http://localhost:3000/mcp/acelink-mcp',
    '<%= config.bin %> run "list all customers" --llm openai --api-key sk-... --mcp http://localhost:3000/mcp/acelink-mcp',
    '<%= config.bin %> run "sync {{resource}} between staging and prod" --var resource=customers --mcp https://staging/mcp --mcp https://prod/mcp',
    '<%= config.bin %> run "list all customers" --verbose --stream',
  ];

  static args = {
    prompt: Args.string({
      required: true,
      description: 'The task or question for the agent. Use {{var}} for template variables.',
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
      description: 'Specific model to use (overrides provider default)',
    }),
    'api-key': Flags.string({
      char: 'k',
      description: 'API key for the LLM provider (overrides env var)',
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
    verbose: Flags.boolean({
      char: 'v',
      description: 'Show each tool call and result as it happens',
      default: false,
    }),
    var: Flags.string({
      description: 'Template variable in key=value format (can be specified multiple times)',
      multiple: true,
    }),
    config: Flags.string({
      char: 'c',
      description: 'Path to a gragent config file (default: gragent.config.json)',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Run);

    // Load config file and merge (flags override config)
    const cfg = loadConfig(flags.config);
    const provider = (flags.llm !== 'claude' ? flags.llm : cfg.llm ?? flags.llm) as LLMProvider;
    const apiKey = flags['api-key'] ?? cfg.apiKey;
    const model = flags.model ?? cfg.model;
    const auth = flags.auth ?? cfg.auth;
    const system = flags.system ?? cfg.system;
    const steps = flags.steps !== 10 ? flags.steps : cfg.steps ?? flags.steps;
    const stream = flags.stream || (cfg.stream ?? false);
    const verbose = flags.verbose || (cfg.verbose ?? false);
    const mcpUrls = flags.mcp?.length ? flags.mcp : cfg.mcps ?? [];

    // Replace {{var}} placeholders in prompt
    let prompt = args.prompt;
    for (const v of flags.var ?? []) {
      const [key, ...rest] = v.split('=');
      const value = rest.join('=');
      prompt = prompt.replaceAll(`{{${key}}}`, value);
    }

    this.log(chalk.cyan(`\n🤖 Running agent (${provider}${model ? `:${model}` : ''})...`));
    if (mcpUrls.length === 1) this.log(chalk.dim(`   MCP: ${mcpUrls[0]}`));
    if (mcpUrls.length > 1) this.log(chalk.dim(`   MCPs: ${mcpUrls.join(', ')}`));
    if (stream) this.log(chalk.dim(`   Streaming: on`));
    if (verbose) this.log(chalk.dim(`   Verbose: on`));
    this.log('');

    const result = await runAgent({
      prompt,
      provider,
      model,
      apiKey,
      mcpUrls,
      auth,
      system,
      maxSteps: steps,
      streaming: stream,
      verbose,
    });

    if (!stream) {
      this.log(chalk.bold('--- Agent Output ---'));
      this.log(result);
    }
  }
}
