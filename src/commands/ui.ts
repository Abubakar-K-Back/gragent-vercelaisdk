import { Command, Flags } from '@oclif/core';
import express from 'express';
import { runAgent } from '../utils/agent.js';
import { LLMProvider } from '../utils/llm.js';
import chalk from 'chalk';

export default class UI extends Command {
  static description = 'Launch a browser UI to interact with your MCP agent';

  static examples = [
    '<%= config.bin %> ui --mcp http://localhost:3000/mcp/acelink-mcp --llm gemini --api-key YOUR_KEY',
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
      description: 'Maximum steps per agent run',
      default: 10,
    }),
    port: Flags.integer({
      char: 'p',
      description: 'Port to listen on',
      default: 4000,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(UI);
    const provider = flags.llm as LLMProvider;
    const mcpUrls = flags.mcp ?? [];
    const app = express();
    app.use(express.json());

    // Serve the browser UI
    app.get('/', (_req, res) => {
      res.send(buildUI(provider, flags.model, mcpUrls, flags.port));
    });

    // Run agent and stream response
    app.post('/run', async (req, res) => {
      const { prompt } = req.body;
      if (!prompt) return res.status(400).json({ error: 'prompt is required' });

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const send = (type: string, data: object) => {
        res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      };

      try {
        const result = await runAgent({
          prompt,
          provider,
          model: flags.model,
          apiKey: flags['api-key'],
          mcpUrls,
          auth: flags.auth,
          maxSteps: flags.steps,
          verbose: false,
        });
        send('done', { text: result });
      } catch (err: any) {
        send('error', { message: err?.message ?? String(err) });
      } finally {
        res.end();
      }
    });

    // List tools
    app.get('/tools', async (_req, res) => {
      const { createMCPClient } = await import('@ai-sdk/mcp');
      const allTools: Record<string, string> = {};
      for (const url of mcpUrls) {
        const client = await createMCPClient({ transport: { type: 'http', url } });
        const t = await client.tools();
        for (const [name, tool] of Object.entries(t)) {
          allTools[name] = (tool as any).description ?? '';
        }
        await client.close();
      }
      res.json(allTools);
    });

    app.listen(flags.port, () => {
      this.log(chalk.green(`\n🌐 gragent UI running at http://localhost:${flags.port}`));
      this.log(chalk.dim(`   Provider: ${provider}${flags.model ? `:${flags.model}` : ''}`));
      if (mcpUrls.length) this.log(chalk.dim(`   MCPs: ${mcpUrls.join(', ')}`));
      this.log(chalk.dim(`   Press Ctrl+C to stop\n`));
    });

    // Keep process alive
    await new Promise(() => {});
  }
}

function buildUI(provider: string, model: string | undefined, mcpUrls: string[], port: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>gragent</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f0f; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; }
    header { padding: 16px 24px; background: #1a1a1a; border-bottom: 1px solid #2a2a2a; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 18px; font-weight: 700; color: #fff; }
    header .badge { background: #2a2a2a; color: #888; font-size: 12px; padding: 3px 8px; border-radius: 4px; }
    .main { flex: 1; display: flex; overflow: hidden; }
    .sidebar { width: 260px; background: #141414; border-right: 1px solid #2a2a2a; padding: 16px; overflow-y: auto; flex-shrink: 0; }
    .sidebar h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #555; margin-bottom: 12px; }
    .tool-item { font-size: 12px; color: #888; padding: 6px 8px; border-radius: 4px; margin-bottom: 2px; cursor: default; }
    .tool-item:hover { background: #1e1e1e; color: #ccc; }
    .tool-name { color: #4ade80; font-weight: 600; }
    .chat { flex: 1; display: flex; flex-direction: column; }
    .messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .message { max-width: 80%; }
    .message.user { align-self: flex-end; }
    .message.agent { align-self: flex-start; }
    .bubble { padding: 12px 16px; border-radius: 12px; line-height: 1.6; font-size: 14px; white-space: pre-wrap; }
    .user .bubble { background: #2563eb; color: #fff; border-bottom-right-radius: 2px; }
    .agent .bubble { background: #1e1e1e; color: #e0e0e0; border-bottom-left-radius: 2px; border: 1px solid #2a2a2a; }
    .agent .bubble.thinking { color: #666; font-style: italic; }
    .input-area { padding: 16px 24px; background: #141414; border-top: 1px solid #2a2a2a; display: flex; gap: 10px; }
    textarea { flex: 1; background: #1e1e1e; border: 1px solid #2a2a2a; color: #e0e0e0; border-radius: 8px; padding: 10px 14px; font-size: 14px; resize: none; height: 48px; line-height: 1.5; font-family: inherit; outline: none; }
    textarea:focus { border-color: #2563eb; }
    button { background: #2563eb; color: #fff; border: none; border-radius: 8px; padding: 0 20px; font-size: 14px; font-weight: 600; cursor: pointer; }
    button:hover { background: #1d4ed8; }
    button:disabled { background: #1e3a6e; cursor: not-allowed; color: #666; }
    .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: #444; font-size: 14px; }
  </style>
</head>
<body>
  <header>
    <h1>gragent</h1>
    <span class="badge">${provider}${model ? `:${model}` : ''}</span>
    ${mcpUrls.map(u => `<span class="badge">${new URL(u).hostname}</span>`).join('')}
  </header>
  <div class="main">
    <div class="sidebar">
      <h3>MCP Tools</h3>
      <div id="tools"><div style="color:#555;font-size:12px">Loading...</div></div>
    </div>
    <div class="chat">
      <div class="messages" id="messages">
        <div class="empty">Ask me anything about your data</div>
      </div>
      <div class="input-area">
        <textarea id="input" placeholder="e.g. list all customers in New York..." onkeydown="handleKey(event)"></textarea>
        <button id="send" onclick="sendMessage()">Send</button>
      </div>
    </div>
  </div>
  <script>
    // Load tools
    fetch('/tools').then(r => r.json()).then(tools => {
      const el = document.getElementById('tools');
      const entries = Object.entries(tools);
      if (!entries.length) { el.innerHTML = '<div style="color:#555;font-size:12px">No tools found</div>'; return; }
      el.innerHTML = entries.map(([name, desc]) =>
        '<div class="tool-item"><div class="tool-name">' + name + '</div><div>' + (desc || '') + '</div></div>'
      ).join('');
    });

    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendMessage();
    }

    async function sendMessage() {
      const input = document.getElementById('input');
      const prompt = input.value.trim();
      if (!prompt) return;

      const messages = document.getElementById('messages');
      const empty = messages.querySelector('.empty');
      if (empty) empty.remove();

      // User message
      messages.innerHTML += '<div class="message user"><div class="bubble">' + escHtml(prompt) + '</div></div>';
      input.value = '';
      input.style.height = '48px';

      // Thinking indicator
      const agentId = 'msg-' + Date.now();
      messages.innerHTML += '<div class="message agent" id="' + agentId + '"><div class="bubble thinking">Thinking...</div></div>';
      messages.scrollTop = messages.scrollHeight;

      document.getElementById('send').disabled = true;

      try {
        const res = await fetch('/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt }),
        });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = JSON.parse(line.slice(6));
            const el = document.getElementById(agentId);
            if (data.type === 'done') {
              el.querySelector('.bubble').classList.remove('thinking');
              el.querySelector('.bubble').textContent = data.text;
            } else if (data.type === 'error') {
              el.querySelector('.bubble').classList.remove('thinking');
              el.querySelector('.bubble').style.color = '#ef4444';
              el.querySelector('.bubble').textContent = 'Error: ' + data.message;
            }
          }
        }
      } catch (e) {
        document.getElementById(agentId).querySelector('.bubble').textContent = 'Error: ' + e.message;
      }

      messages.scrollTop = messages.scrollHeight;
      document.getElementById('send').disabled = false;
      input.focus();
    }

    function escHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
  </script>
</body>
</html>`;
}
