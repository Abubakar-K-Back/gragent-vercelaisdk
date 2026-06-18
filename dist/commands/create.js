import { Args, Command, Flags } from '@oclif/core';
import { generateText, stepCountIs } from 'ai';
import { getLLM } from '../utils/llm.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
const SCAFFOLD_SYSTEM = `You are an expert AI agent architect. Given a plain English description of what an agent should do, you output a JSON spec for scaffolding an agent project.

Output ONLY valid JSON with this exact shape:
{
  "name": "agent-name-kebab-case",
  "description": "one line description",
  "system": "the system prompt for the agent",
  "tools": ["list", "of", "tool", "categories", "the", "agent", "needs"],
  "useMcp": true or false (true if agent needs to call REST APIs or grapi endpoints),
  "steps": 3 to 20 (how many tool-use steps the agent might need)
}`;
export default class Create extends Command {
    static description = 'Scaffold a new AI agent from a plain English description';
    static examples = [
        '<%= config.bin %> create "an agent that lists all users and sends them a welcome email"',
        '<%= config.bin %> create "monitor database and alert on anomalies" --llm openai --model gpt-4o-mini',
        '<%= config.bin %> create "summarize daily reports" --llm gemini --mcp http://localhost:3333/mcp --auth my-token',
        '<%= config.bin %> create "fetch user data" --name my-user-agent --steps 5 --stream',
    ];
    static args = {
        description: Args.string({
            required: true,
            description: 'Plain English description of what your agent should do',
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
            description: 'Specific model to use (e.g. gpt-4o-mini, claude-haiku-4-5, gemini-1.5-flash)',
        }),
        mcp: Flags.string({
            char: 'm',
            description: 'MCP server URL to pre-fill in the scaffolded agent',
        }),
        auth: Flags.string({
            char: 'a',
            description: 'Bearer token for MCP server authentication',
        }),
        system: Flags.string({
            description: 'Override the generated system prompt with a custom one',
        }),
        name: Flags.string({
            char: 'n',
            description: 'Override the generated agent name',
        }),
        steps: Flags.integer({
            char: 's',
            description: 'Override the generated max steps',
        }),
        stream: Flags.boolean({
            description: 'Scaffold agent with streaming output instead of generateText',
            default: false,
        }),
        outDir: Flags.string({
            char: 'o',
            description: 'Output directory for the scaffolded agent',
            default: '.',
        }),
    };
    async run() {
        const { args, flags } = await this.parse(Create);
        const provider = flags.llm;
        this.log(chalk.cyan('🤖 Generating agent spec...'));
        const model = getLLM(provider, flags.model);
        const { text: specJson } = await generateText({
            model,
            system: SCAFFOLD_SYSTEM,
            prompt: args.description,
            stopWhen: stepCountIs(1),
        });
        let spec;
        try {
            const cleaned = specJson.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
            spec = JSON.parse(cleaned);
        }
        catch {
            this.error(`Failed to parse agent spec from LLM response:\n${specJson}`);
        }
        // Apply flag overrides
        if (flags.name)
            spec.name = flags.name;
        if (flags.system)
            spec.system = flags.system;
        if (flags.steps)
            spec.steps = flags.steps;
        if (flags.mcp)
            spec.useMcp = true;
        this.log(chalk.green(`✓ Agent spec generated: ${spec.name}`));
        const agentDir = join(flags.outDir, spec.name);
        if (existsSync(agentDir)) {
            this.error(`Directory already exists: ${agentDir}`);
        }
        mkdirSync(agentDir, { recursive: true });
        mkdirSync(join(agentDir, 'src'), { recursive: true });
        // package.json
        writeFileSync(join(agentDir, 'package.json'), JSON.stringify({
            name: spec.name,
            version: '1.0.0',
            description: spec.description,
            type: 'module',
            scripts: {
                build: 'tsc -b',
                start: 'node dist/index.js',
                dev: 'tsc -b && node dist/index.js',
            },
            dependencies: {
                ai: '^6.0.0',
                '@ai-sdk/anthropic': '^3.0.0',
                '@ai-sdk/openai': '^3.0.0',
                '@ai-sdk/google': '^3.0.0',
                '@ai-sdk/mcp': '^1.0.0',
                chalk: '^5.0.0',
            },
            devDependencies: {
                typescript: '^5.0.0',
                '@types/node': '^18.0.0',
            },
        }, null, 2));
        // tsconfig.json
        writeFileSync(join(agentDir, 'tsconfig.json'), JSON.stringify({
            compilerOptions: {
                target: 'ES2022',
                module: 'NodeNext',
                moduleResolution: 'NodeNext',
                outDir: 'dist',
                rootDir: 'src',
                strict: true,
                esModuleInterop: true,
                skipLibCheck: true,
            },
            include: ['src/**/*'],
            exclude: ['node_modules', 'dist'],
        }, null, 2));
        // .env
        const mcpUrl = flags.mcp ?? 'http://localhost:3333/mcp';
        writeFileSync(join(agentDir, '.env'), [
            '# API Keys — fill in whichever provider you are using',
            'ANTHROPIC_API_KEY=',
            'OPENAI_API_KEY=',
            'GOOGLE_GENERATIVE_AI_API_KEY=',
            '',
            `# MCP Server URL${flags.mcp ? ' (pre-filled from --mcp flag)' : ''}`,
            `MCP_URL=${mcpUrl}`,
            '',
            '# Optional: Bearer token for MCP authentication',
            `MCP_AUTH=${flags.auth ?? ''}`,
        ].join('\n'));
        // .gitignore
        writeFileSync(join(agentDir, '.gitignore'), 'node_modules/\ndist/\n.env\n');
        // src/index.ts
        const { importLine, modelLine } = this.modelSnippet(provider, flags.model);
        const mcpImport = spec.useMcp ? `import { createMCPClient } from '@ai-sdk/mcp';\n` : '';
        const mcpSetup = spec.useMcp
            ? `
  const auth = process.env.MCP_AUTH;
  const mcp = await createMCPClient({
    transport: {
      type: 'http',
      url: process.env.MCP_URL ?? '${mcpUrl}',
      ...(auth ? { headers: { Authorization: \`Bearer \${auth}\` } } : {}),
    },
  });
  const tools = await mcp.tools();`
            : `\n  const tools = undefined;`;
        const mcpClose = spec.useMcp ? `    await mcp.close();\n` : '';
        const agentBody = flags.stream
            ? `  const { textStream, steps } = streamText({
    model,
    system: SYSTEM,
    prompt,
    tools: tools as Parameters<typeof streamText>[0]['tools'],
    stopWhen: stepCountIs(${spec.steps}),
  });

  for await (const chunk of textStream) {
    process.stdout.write(chunk);
  }
  process.stdout.write('\\n');
  const resolvedSteps = await steps;
  console.log(\`\\n(completed in \${resolvedSteps.length} steps)\`);`
            : `  const { text, steps } = await generateText({
    model,
    system: SYSTEM,
    prompt,
    tools: tools as Parameters<typeof generateText>[0]['tools'],
    stopWhen: stepCountIs(${spec.steps}),
  });

  console.log('\\n--- Agent Output ---');
  console.log(text);
  console.log(\`\\n(completed in \${steps.length} steps)\`);`;
        const aiImport = flags.stream
            ? `import { streamText, stepCountIs } from 'ai';`
            : `import { generateText, stepCountIs } from 'ai';`;
        writeFileSync(join(agentDir, 'src/index.ts'), `${aiImport}
${mcpImport}${importLine}

${modelLine}

const SYSTEM = \`${spec.system}\`;

async function main() {
  const prompt = process.argv.slice(2).join(' ') || 'Help me get started';
${mcpSetup}

  console.log('Running agent...');
  try {
${agentBody}
  } finally {
${mcpClose}  }
}

main().catch(console.error);
`);
        // README.md
        writeFileSync(join(agentDir, 'README.md'), `# ${spec.name}

${spec.description}

## Setup

\`\`\`bash
npm install
# fill in .env with your API keys
\`\`\`

## Run

\`\`\`bash
npm run dev "your task here"
\`\`\`

## Configuration

| Env var | Description |
|---|---|
| \`ANTHROPIC_API_KEY\` / \`OPENAI_API_KEY\` / \`GOOGLE_GENERATIVE_AI_API_KEY\` | LLM API key |
| \`MCP_URL\` | MCP server URL (default: \`${mcpUrl}\`) |
| \`MCP_AUTH\` | Optional Bearer token for MCP auth |

## Tools

${spec.tools.map((t) => `- ${t}`).join('\n')}

${spec.useMcp ? `## MCP\n\nConnects to MCP server at \`MCP_URL\`. Make sure grapi has \`MCP_CONFIGS={"enable":true}\`.\n` : ''}
---
*Scaffolded by [gragent](https://github.com/grapple-solution/gragent)*
`);
        this.log(chalk.green(`\n✓ Agent scaffolded at ${chalk.bold(agentDir)}`));
        this.log(`\nNext steps:`);
        this.log(`  cd ${agentDir}`);
        this.log(`  npm install`);
        this.log(`  # fill in .env with your API keys`);
        this.log(`  npm run dev "your task here"\n`);
    }
    modelSnippet(provider, model) {
        const modelStr = model ? `'${model}'` : undefined;
        switch (provider) {
            case 'claude':
                return {
                    importLine: `import { anthropic } from '@ai-sdk/anthropic';`,
                    modelLine: `const model = anthropic(${modelStr ?? `'claude-opus-4-6'`});`,
                };
            case 'openai':
                return {
                    importLine: `import { openai } from '@ai-sdk/openai';`,
                    modelLine: `const model = openai(${modelStr ?? `'gpt-4o'`});`,
                };
            case 'gemini':
                return {
                    importLine: `import { google } from '@ai-sdk/google';`,
                    modelLine: `const model = google(${modelStr ?? `'gemini-1.5-pro'`});`,
                };
        }
    }
}
//# sourceMappingURL=create.js.map