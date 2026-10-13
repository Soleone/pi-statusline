// A scripted model, so the demo runs real pi without an API key and nothing leaves the browser.
// Each prompt below has a fixed run of replies; the tools they call (read, edit, bash) are real.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  calculateCost,
  createAssistantMessageEventStream,
  createFauxCore,
  fauxAssistantMessage,
  fauxText,
  fauxThinking,
  fauxToolCall,
} from "@earendil-works/pi-ai";

const model = {
  id: "scripted",
  name: "Scripted",
  reasoning: true,
  input: ["text" as const],
  // Priced like a mid-size hosted model, so the cost in the status line moves the way it would.
  cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
  contextWindow: 200_000,
  maxTokens: 32_000,
};

const oldLine = 'console.log(`${city}: ${reading.sky}, ${reading.low}-${reading.high}°C, ${Math.round(reading.rain * 100)}% chance of rain`);';
const newLines = `if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ city, ...reading }));
} else {
  ${oldLine}
}`;

type Step = ReturnType<typeof fauxAssistantMessage>;
const toolUse = { stopReason: "toolUse" as const };

// Matched against the latest prompt; each entry lists the replies in order, one per model request.
const scripts: { match: RegExp; steps: Step[] }[] = [
  {
    match: /what does|explain|about/i,
    steps: [
      fauxAssistantMessage([fauxThinking("Start with the README, then the entry point."), fauxToolCall("read", { path: "README.md" }), fauxToolCall("read", { path: "src/cli.js" })], toolUse),
      fauxAssistantMessage([fauxText("It's **forecast**, a tiny offline weather CLI. `src/cli.js` takes a city, looks it up in the bundled sample in `src/readings.js`, and prints the sky, the temperature range and the chance of rain. Unknown cities get a short error listing the ones it knows.")]),
    ],
  },
  {
    match: /json/i,
    steps: [
      fauxAssistantMessage([fauxThinking("A flag check around the final print is enough; keep the text output as it is."), fauxToolCall("edit", { path: "src/cli.js", edits: [{ oldText: oldLine, newText: newLines }] })], toolUse),
      fauxAssistantMessage([fauxThinking("Run it both ways."), fauxToolCall("bash", { command: "node src/cli.js Berlin --json && node src/cli.js Berlin" })], toolUse),
      fauxAssistantMessage([fauxText("Added `--json`: it prints the reading as one JSON object, and the plain output is unchanged. The working tree is dirty now, which is why the branch in the status line shows `main*`.")]),
    ],
  },
];

const fallback = fauxAssistantMessage([
  fauxText("I'm a scripted stand-in for a model, so I only know a few prompts. Try **what does this project do?** or **add a --json flag**, and watch the status line below: context, cost, cache reads and the cache TTL all move with each turn."),
]);

function text(content: unknown): string {
  return typeof content === "string" ? content : Array.isArray(content) ? content.map((part) => part?.text ?? "").join(" ") : "";
}

function nextStep(context: { messages: { role: string; content: unknown }[] }): Step {
  const lastUser = context.messages.findLastIndex((message) => message.role === "user");
  const prompt = text(context.messages[lastUser]?.content);
  const replies = context.messages.slice(lastUser + 1).filter((message) => message.role === "assistant").length;
  const script = scripts.find((candidate) => candidate.match.test(prompt));
  return script?.steps[replies] ?? (replies === 0 ? fallback : fauxAssistantMessage([fauxText("Done.")]));
}

export default function demoModel(pi: ExtensionAPI): void {
  const core = createFauxCore({ provider: "demo", api: "demo-scripted", models: [model], tokensPerSecond: 90 });
  pi.registerProvider("demo", {
    name: "Demo",
    baseUrl: "http://demo.invalid",
    apiKey: "demo",
    api: "demo-scripted" as never,
    models: [model],
    streamSimple: (requestModel, context, options) => {
      core.setResponses([nextStep(context as never)]);
      const source = core.streamSimple(requestModel as never, context, options);
      // The faux provider counts tokens but leaves cost at zero; price them like a real reply.
      const priced = createAssistantMessageEventStream();
      void (async () => {
        for await (const event of source) {
          if (event.type === "done") event.message.usage.cost = calculateCost(requestModel, event.message.usage);
          priced.push(event);
        }
        priced.end();
      })();
      return priced;
    },
  });
}
