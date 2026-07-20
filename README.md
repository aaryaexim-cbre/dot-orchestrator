# dot-orchestrator

Hackathon experiment — side-by-side AI orchestration demo. Not part of AaryaExim.ai production systems.

## What it does

Submit one question, and the app sends it simultaneously to two independent AI models — GPT-5.6 (OpenAI) and a free-tier model via OpenRouter. Each model returns a structured **Verdict**, **Confidence**, and **Reasoning**. Once both respond, a third GPT-5.6 synthesis call produces an **Insight Card** identifying where the models genuinely agree, where they conflict (naming the specific differing assumption, not just "they disagree"), what single fact is missing, and the best next question to ask.

## Run locally

1. Add your API keys and model IDs to your shell or a local process manager:
   ```bash
   export OPENAI_API_KEY=your_openai_api_key
   export OPENAI_MODEL=gpt-5.6-terra
   export OPENROUTER_API_KEY=your_openrouter_api_key
   export OPENROUTER_MODEL_B=qwen/qwen3-coder:free
   ```
2. Start the web app:
   ```bash
   npm start
   ```
3. Open [http://localhost:3000](http://localhost:3000).

The Node server sends the submitted question to OpenAI (Model A) and OpenRouter (Model B) at the same time, renders both structured responses side by side, and — only if both succeed — runs a synthesis call to produce the Insight Card.

## How this project was built with Codex and GPT-5.6

This project was built end-to-end using OpenAI Codex (Codex Cloud) across several iterative build tasks in a single day:

- **Initial build:** Codex scaffolded the Node.js server, the static frontend (input box, response cards), and the first working version calling two AI providers concurrently with per-provider error handling.
- **Structured response format:** Codex was directed to change each model's output from free-text to a fixed Verdict/Confidence/Reasoning JSON structure, with a collapsible "Why?" control so the full reasoning stays available without cluttering the default view.
- **Insight Card synthesis layer:** Codex added a second-stage synthesis call that reads both structured responses and produces Agreement, Conflict, Missing Information, and Next Best Question — with an explicit requirement (added after reviewing an early output) that the Conflict field must name the specific differing assumption causing disagreement, not just state that the models disagree.
- **Reliability fixes:** Codex fixed a race condition where an older, slower response could overwrite a newer one on screen if a user submitted a second question before the first finished, and added request timeouts plus structured logging after a live debugging session.
- **Provider swaps:** the app's model pairing was changed twice during development (from OpenAI+Anthropic, to two OpenRouter models, to the final OpenAI+OpenRouter pairing) as free-tier model availability shifted — Codex handled each swap while preserving the core Verdict/Confidence/Reasoning and Insight Card logic unchanged.

**Key product and engineering decisions made by the developer, not Codex:** choosing the Verdict/Confidence/Reasoning structure over a pure free-text or pure-verdict format (to preserve trust in the reasoning behind each answer); requiring the Conflict field to name a specific assumption rather than accept a generic "they disagree" output; scoping out report export, user accounts, and model-selection dropdowns to keep the build honest and achievable in the available time; and choosing GPT-5.6 (via OpenAI) alongside an OpenRouter model specifically so the running app — not just the build process — genuinely uses GPT-5.6.

GPT-5.6 contributes to the final result in two ways: as Model A, generating one of the two compared structured answers, and as the synthesis model producing the Insight Card from both models' responses.