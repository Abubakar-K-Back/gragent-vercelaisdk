# gragent

CLI to scaffold and run AI agents powered by the [Vercel AI SDK](https://sdk.vercel.ai/) + any MCP server (like [grapi](https://github.com/grapple-solution/grapi)).

## Features

- **Run** agents against any prompt using Claude, OpenAI, Gemini, or Groq
- **Chat** interactively with full conversation memory (remembers tool calls across turns)
- **Pipeline** — chain multiple agents sequentially, each receiving the previous output
- **Listen** — Kafka consumer mode: receive tasks from a topic, run agents, publish results back
- **UI** — browser-based chat interface with tools sidebar
- **List** all tools available on an MCP server
- **Scaffold** full agent projects from plain English descriptions
- Multiple MCP servers, streaming output, verbose tool tracing, bearer token auth

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
| `--mcp` | `-m` | MCP server URL (repeatable for multiple) | — |
| `--auth` | `-a` | Bearer token for MCP server authentication | — |
| `--system` | | Custom system prompt | Built-in default |
| `--steps` | `-s` | Max tool-use steps | `10` |
| `--stream` | | Stream output token by token | `false` |
| `--verbose` | `-v` | Show each tool call and result | `false` |
| `--var` | | Template variable `key=value` (repeatable) | — |

---

### `gragent chat`

Interactive terminal chat with full conversation memory — the agent remembers previous turns including tool calls.

```bash
gragent chat \
  --llm gemini \
  --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/your-mcp

# With session persistence
gragent chat \
  --llm gemini \
  --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/your-mcp \
  --save session.json

# Resume a previous session
gragent chat \
  --llm gemini \
  --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/your-mcp \
  --load session.json
```

Special commands during chat: `clear` (reset history), `history` (show message count), `exit`.

**Flags**

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--llm` | `-l` | LLM provider | `claude` |
| `--api-key` | `-k` | API key | Reads from env var |
| `--mcp` | `-m` | MCP server URL (repeatable) | — |
| `--auth` | `-a` | Bearer token | — |
| `--steps` | `-s` | Max steps per turn | `10` |
| `--verbose` | `-v` | Show tool calls + memory count | `false` |
| `--save` | | Save session to JSON on exit | — |
| `--load` | | Resume session from JSON | — |

---

### `gragent pipeline`

Chain multiple agents sequentially. Use `{{output}}` to pass the previous agent's output to the next.

```bash
gragent pipeline \
  "get all addresses in New York and return their IDs" \
  "for this data: {{output}} — group by zip code and find the most common one" \
  "write a summary report based on: {{output}}" \
  --llm gemini \
  --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/your-mcp
```

**Flags**

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--llm` | `-l` | LLM provider | `claude` |
| `--api-key` | `-k` | API key | Reads from env var |
| `--mcp` | `-m` | MCP server URL (repeatable) | — |
| `--auth` | `-a` | Bearer token | — |
| `--steps` | `-s` | Max steps per agent | `10` |
| `--verbose` | `-v` | Show tool calls | `false` |

---

### `gragent listen`

Kafka consumer mode — listens for agent tasks on a Kafka topic, runs the agent, and publishes results back.

```bash
gragent listen \
  --broker localhost:9092 \
  --input agent-tasks \
  --output agent-results \
  --mcp https://your-grapi.example.com/mcp/your-mcp \
  --llm gemini \
  --api-key YOUR_KEY
```

**Input message format** (publish to `agent-tasks`):
```json
{
  "taskId": "abc123",
  "prompt": "get all addresses in New York and return a summary",
  "mcp": "https://your-grapi.example.com/mcp/your-mcp"
}
```

**Output message format** (consumed from `agent-results`):
```json
{
  "taskId": "abc123",
  "status": "success",
  "result": "Here is the summary...",
  "durationMs": 4824,
  "prompt": "get all addresses in New York and return a summary"
}
```

**Flags**

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--broker` | `-b` | Kafka broker address | `localhost:9092` |
| `--input` | `-i` | Input topic for tasks | `agent-tasks` |
| `--output` | `-o` | Output topic for results | `agent-results` |
| `--group-id` | | Kafka consumer group ID | `gragent-consumers` |
| `--llm` | `-l` | LLM provider | `claude` |
| `--api-key` | `-k` | API key | Reads from env var |
| `--mcp` | `-m` | Default MCP URL (overridable per message) | — |
| `--auth` | `-a` | Bearer token | — |
| `--steps` | `-s` | Max steps per agent run | `10` |
| `--verbose` | `-v` | Show tool calls | `false` |

---

### `gragent ui`

Launch a browser UI to interact with your MCP agent.

```bash
gragent ui \
  --mcp https://your-grapi.example.com/mcp/your-mcp \
  --llm gemini \
  --api-key YOUR_KEY \
  --port 4000
```

Then open `http://localhost:4000` in your browser.

**Flags**

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--llm` | `-l` | LLM provider | `claude` |
| `--api-key` | `-k` | API key | Reads from env var |
| `--mcp` | `-m` | MCP server URL (repeatable) | — |
| `--auth` | `-a` | Bearer token | — |
| `--steps` | `-s` | Max steps per run | `10` |
| `--port` | `-p` | Port to listen on | `4000` |

---

### `gragent list`

List all tools available on an MCP server.

```bash
gragent list --mcp https://your-grapi.example.com/mcp/your-mcp

# Output as JSON
gragent list --mcp https://your-grapi.example.com/mcp/your-mcp --json
```

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
gragent list --mcp https://your-grapi.example.com/mcp/your-mcp-name
```

---

## Examples

### Discover available tools
```bash
gragent list --mcp https://your-grapi.example.com/mcp/acelink-mcp
# Found 50 tools: get_customers, post_customers, get_addresses, ...
```

### Count resources
```bash
gragent run "how many customers do we have?" \
  --llm gemini --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/acelink-mcp
# Output: There are 5 customers in total.
```

### Multi-step business report
```bash
gragent run "get total count of customers, contacts and addresses, list all AWS products and opportunities, return a formatted summary report" \
  --llm gemini --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/acelink-mcp \
  --steps 20
# Agent makes 10+ API calls and returns a full formatted report
```

### Interactive chat with memory
```bash
gragent chat --llm gemini --api-key YOUR_KEY --mcp https://your-grapi.example.com/mcp/acelink-mcp

# You: get all addresses in New York grouped by zip code
# Agent: [fetches data, groups, returns report]
# You: add a summary section at the top         ← agent remembers the report
# You: shorten it                               ← still remembers
```

### Pipeline — chain agents
```bash
gragent pipeline \
  "get all addresses in New York" \
  "from this data: {{output}} — find the zip code with most addresses" \
  "write a one-page business report about: {{output}}" \
  --llm gemini --api-key YOUR_KEY \
  --mcp https://your-grapi.example.com/mcp/acelink-mcp
```

### Kafka event-driven agents
```bash
# Terminal 1 — start gragent as a Kafka consumer
gragent listen \
  --broker localhost:9092 \
  --mcp https://your-grapi.example.com/mcp/acelink-mcp \
  --llm gemini --api-key YOUR_KEY

# Terminal 2 — publish a task
echo '{"taskId":"job-1","prompt":"get all addresses in New York and summarize"}' | \
  kafka-console-producer --broker-list localhost:9092 --topic agent-tasks

# Terminal 3 — consume results
kafka-console-consumer --bootstrap-server localhost:9092 --topic agent-results --from-beginning
# {"taskId":"job-1","status":"success","result":"5 addresses found...","durationMs":4824}
```

---

## Architecture

```
Any Service / grapi (LB4)
        │  publishes task to agent-tasks
        ▼
   Kafka Broker
        │  consumed by
        ▼
  gragent listen
        │  runs AI agent
        ▼
   MCP Tools (grapi)
        │  result published to agent-results
        ▼
   Kafka Broker
        │  consumed by
        ▼
Any Service / grapi (LB4)
```

---

## Related

- [grapi](https://github.com/grapple-solution/grapi) — The backend framework that powers the MCP server
- [loopback-connector-kafka](https://www.npmjs.com/package/@abkawanz/loopback-connector-kafka) — Kafka connector for grapi (LB4)
- [Vercel AI SDK](https://sdk.vercel.ai/) — The AI SDK used under the hood
- [Model Context Protocol](https://modelcontextprotocol.io/) — The protocol for connecting agents to tools
