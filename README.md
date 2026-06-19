# gragent

CLI to scaffold and run AI agents powered by the [Vercel AI SDK](https://sdk.vercel.ai/) + any MCP server (like [grapi](https://github.com/grapple-solution/grapi)).

## Features

- **Run** agents against any prompt using Claude, OpenAI, Gemini, or Groq
- **List** all tools available on an MCP server
- **Scaffold** full agent projects from plain English descriptions
- Supports streaming output, custom system prompts, and bearer token auth

---

## Installation

```bash
git clone https://github.com/Abubakar-K-Back/gragent.git
cd gragent
npm install
npm run build
npm install -g .
```

Or run directly without installing:

```bash
node /path/to/gragent/dist/index.js <command> [flags]
```

---

## Commands

### `gragent run`

Run an AI agent against a prompt using MCP tools.

```bash
gragent run "list all customers" \
  --llm claude \
  --api-key YOUR_ANTHROPIC_KEY \
  --mcp https://your-grapi.example.com/mcp/your-mcp

gragent run "create a new customer named John" \
  --llm openai \
  --api-key YOUR_OPENAI_KEY \
  --mcp https://your-grapi.example.com/mcp/your-mcp \
  --stream

gragent run "summarize all contacts" \
  --llm gemini \
  --api-key YOUR_GEMINI_KEY \
  --mcp https://your-grapi.example.com/mcp/your-mcp \
  --steps 5
```

**Flags**

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--llm` | `-l` | LLM provider (`claude`, `openai`, `gemini`, `groq`) | `claude` |
| `--model` | | Override model (e.g. `gpt-4o-mini`, `claude-haiku-4-5`) | Provider default |
| `--api-key` | `-k` | API key for the LLM provider | Reads from env var |
| `--mcp` | `-m` | MCP server URL | — |
| `--auth` | `-a` | Bearer token for MCP server authentication | — |
| `--system` | | Custom system prompt | Built-in default |
| `--steps` | `-s` | Max tool-use steps | `10` |
| `--stream` | | Stream output token by token | `false` |

---

### `gragent list`

List all tools available on an MCP server.

```bash
gragent list --mcp https://your-grapi.example.com/mcp/your-mcp

# Output as JSON
gragent list --mcp https://your-grapi.example.com/mcp/your-mcp --json
```

**Flags**

| Flag | Short | Description |
|------|-------|-------------|
| `--mcp` | `-m` | MCP server URL (required) |
| `--auth` | `-a` | Bearer token for MCP authentication |
| `--json` | | Output as JSON |

---

### `gragent create`

Scaffold a full agent project from a plain English description.

```bash
gragent create "an agent that lists all customers and sends them a welcome email" \
  --llm claude \
  --api-key YOUR_ANTHROPIC_KEY \
  --mcp https://your-grapi.example.com/mcp/your-mcp

gragent create "monitor database and alert on anomalies" \
  --llm openai \
  --name anomaly-monitor \
  --steps 8 \
  --outDir ./agents
```

The scaffolded project includes:
- `src/index.ts` — ready-to-run agent
- `package.json` — with all dependencies
- `tsconfig.json`
- `.env` — with placeholders for API keys
- `.gitignore`
- `README.md`

**Flags**

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--llm` | `-l` | LLM provider to use for scaffolding | `claude` |
| `--model` | | Override model | Provider default |
| `--api-key` | `-k` | API key for the LLM provider | Reads from env var |
| `--mcp` | `-m` | MCP server URL to pre-fill in the scaffolded agent | — |
| `--auth` | `-a` | Bearer token for MCP authentication | — |
| `--name` | `-n` | Override the generated agent name | Auto-generated |
| `--system` | | Override the generated system prompt | Auto-generated |
| `--steps` | `-s` | Override max steps | Auto-generated |
| `--stream` | | Scaffold with streaming output | `false` |
| `--outDir` | `-o` | Output directory | `.` |

---

## LLM Providers

| Provider | `--llm` | Default Model | Env Var |
|----------|---------|---------------|---------|
| Anthropic Claude | `claude` | `claude-opus-4-6` | `ANTHROPIC_API_KEY` |
| OpenAI | `openai` | `gpt-4o` | `OPENAI_API_KEY` |
| Google Gemini | `gemini` | `gemini-2.5-flash` | `GOOGLE_GENERATIVE_AI_API_KEY` |
| Groq | `groq` | `llama-3.3-70b-versatile` | `GROQ_API_KEY` |

API keys can be passed via `--api-key` flag or set as environment variables.

---

## MCP Server

gragent works with any MCP-compatible server. To use with grapi, enable MCP by deploying with:

```
MCP_CONFIGS={"enable":true}
```

Then discover available MCP endpoints:

```bash
# grapi exposes multiple MCP namespaces
gragent list --mcp https://your-grapi.example.com/mcp/your-mcp-name
```

---

## Examples

### Discover available tools
```bash
gragent list --mcp https://your-grapi.example.com/mcp/acelink-mcp

# Found 50 tools:
#   get_customers         Execute GET /customers
#   post_customers        Execute POST /customers
#   get_addresses         Execute GET /addresses
#   ...
```

### Count resources
```bash
gragent run "how many customers do we have?" \
  --llm gemini \
  --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/acelink-mcp

# Output: There are 5 customers in total.
```

### Create records from plain English
```bash
gragent run "check the format for addresses and create me 3 random addresses with different US states and cities, then return all addresses" \
  --llm gemini \
  --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/acelink-mcp

# Agent figures out the schema, creates 3 addresses, then lists all of them
```

### Filter and query
```bash
gragent run "return all addresses in New York" \
  --llm gemini \
  --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/acelink-mcp

# Agent builds the LoopBack filter automatically and returns only NY addresses
```

### Full business report (multi-step)
```bash
gragent run "Give me a full business summary:
1. Get total count of customers, contacts and addresses
2. List all customers and for each get their contacts and addresses
3. List all AWS products
4. Check AWS opportunities
5. Return a nicely formatted summary report" \
  --llm gemini \
  --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/acelink-mcp \
  --steps 20

# Agent makes 10+ API calls and returns a full formatted report
```

### Scaffold a new agent project
```bash
gragent create "fetch all AWS opportunities and sync them to matching customers" \
  --llm gemini \
  --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/acelink-mcp \
  --outDir ./my-agents

# Generates a full ready-to-run agent project with package.json, src/index.ts, .env, README
```

---

## Related

- [grapi](https://github.com/grapple-solution/grapi) — The backend framework that powers the MCP server
- [Vercel AI SDK](https://sdk.vercel.ai/) — The AI SDK used under the hood
- [Model Context Protocol](https://modelcontextprotocol.io/) — The protocol for connecting agents to tools
