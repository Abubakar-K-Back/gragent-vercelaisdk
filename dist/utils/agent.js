import { generateText, streamText, stepCountIs } from 'ai';
import { createMCPClient } from '@ai-sdk/mcp';
import { getLLM } from './llm.js';
export async function runAgent(options) {
    const { prompt, provider, model, mcpUrl, auth, system, maxSteps = 10, streaming = false } = options;
    const llm = getLLM(provider, model);
    let tools;
    let mcp;
    if (mcpUrl) {
        mcp = await createMCPClient({
            transport: {
                type: 'http',
                url: mcpUrl,
                ...(auth ? { headers: { Authorization: `Bearer ${auth}` } } : {}),
            },
        });
        tools = await mcp.tools();
    }
    const systemPrompt = system ?? 'You are a helpful AI agent. Use the available tools to complete tasks.';
    const stopCondition = stepCountIs(maxSteps);
    const toolsParam = tools;
    try {
        if (streaming) {
            const { textStream, steps } = streamText({
                model: llm,
                prompt,
                system: systemPrompt,
                tools: toolsParam,
                stopWhen: stopCondition,
            });
            let full = '';
            for await (const chunk of textStream) {
                process.stdout.write(chunk);
                full += chunk;
            }
            process.stdout.write('\n');
            const resolvedSteps = await steps;
            process.stdout.write(`\n(completed in ${resolvedSteps.length} steps)\n`);
            return full;
        }
        else {
            const { text } = await generateText({
                model: llm,
                prompt,
                system: systemPrompt,
                tools: toolsParam,
                stopWhen: stopCondition,
            });
            return text;
        }
    }
    finally {
        await mcp?.close();
    }
}
//# sourceMappingURL=agent.js.map