import { Command, Flags } from '@oclif/core';
import { createMCPClient } from '@ai-sdk/mcp';
import chalk from 'chalk';

export default class List extends Command {
  static description = 'List all tools available on an MCP server';

  static examples = [
    '<%= config.bin %> list --mcp http://localhost:3000/mcp',
    '<%= config.bin %> list --mcp http://localhost:3333/mcp --auth my-token',
  ];

  static flags = {
    mcp: Flags.string({
      char: 'm',
      description: 'MCP server URL',
      required: true,
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

    this.log(chalk.cyan(`\nConnecting to MCP server: ${flags.mcp}\n`));

    const mcp = await createMCPClient({
      transport: {
        type: 'http',
        url: flags.mcp,
        ...(flags.auth ? { headers: { Authorization: `Bearer ${flags.auth}` } } : {}),
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
