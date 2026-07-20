# dot-orchestrator

Hackathon experiment — side-by-side AI orchestration demo. Not part of AaryaExim.ai production systems.

## Run locally

1. Add your OpenRouter API key and two OpenRouter model IDs to your shell or a local process manager:
   ```bash
   export OPENROUTER_API_KEY=your_openrouter_api_key
   export OPENROUTER_MODEL_A=deepseek/deepseek-r1:free
   export OPENROUTER_MODEL_B=qwen/qwen3-coder:free
   ```
2. Start the web app:
   ```bash
   npm start
   ```
3. Open [http://localhost:3000](http://localhost:3000).

The app has one text input. When you submit a message, the Node server sends the prompt to OpenRouter twice at the same time using the two configured model IDs and returns both responses for a side-by-side comparison.
