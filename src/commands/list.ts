import { Command, Flags } from '@oclif/core';
import { createMCPClient } from '@ai-sdk/mcp';
import { loadConfig } from '../utils/config.js';
import chalk from 'chalk';

export default class List extends Command {
  static description = 'List all tools available on an MCP server';

  static examples = [
    '<%= config.bin %> list --mcp http://localhost:3000/mcp',
    '<%= config.bin %> list --mcp http://localhost:3333/mcp --auth my-token',
  ];

  static flags = {
    config: Flags.string({
      char: 'c',
      description: 'Path to a gragent config file (JSON)',
    }),
    mcp: Flags.string({
      char: 'm',
      description: 'MCP server URL',
    }),
    auth: Flags.string({
      char: 'a',
      description: 'Bearer token for MCP server authentication',
    }),
    json: Flags.boolean({
      description: 'Output as JSON',
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(List);
    const cfg = loadConfig(flags.config);
    const mcpUrl = flags.mcp ?? cfg.mcps?.[0];
    const auth = flags.auth ?? cfg.auth;

    if (!mcpUrl) {
      this.error('MCP server URL is required. Pass --mcp or set mcps in config file.');
    }

    this.log(chalk.cyan(`\nConnecting to MCP server: ${mcpUrl}\n`));

    const mcp = await createMCPClient({
      transport: {
        type: 'http',
        url: mcpUrl,
        ...(auth ? { headers: { Authorization: `Bearer ${auth}` } } : {}),
      },
    });

    try {
      const tools = await mcp.tools();
      const toolList = Object.entries(tools);

      if (flags.json) {
        this.log(JSON.stringify(
          toolList.map(([name, tool]) => ({
            name,
            description: (tool as any).description ?? '',
            parameters: (tool as any).parameters ?? {},
          })),
          null,
          2,
        ));
        return;
      }

      this.log(chalk.bold(`Found ${toolList.length} tools:\n`));

      for (const [name, tool] of toolList) {
        const desc = (tool as any).description ?? '';
        this.log(`  ${chalk.green(chalk.bold(name))}`);
        if (desc) this.log(`    ${chalk.dim(desc)}`);
        this.log('');
      }
    } finally {
      await mcp.close();
    }
  }
}
