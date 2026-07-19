# dot-orchestrator

Hackathon experiment — side-by-side AI orchestration demo. Not part of AaryaExim.ai production systems.

## Run locally

1. Add API keys to your shell or a local process manager:
   ```bash
   export OPENAI_API_KEY=your_openai_api_key
   export OPENROUTER_API_KEY=your_openrouter_api_key
   ```
2. Start the web app:
   ```bash
   npm start
   ```
3. Open [http://localhost:3000](http://localhost:3000).

The app has one text input. When you submit a message, the Node server sends the prompt to the OpenAI and OpenRouter APIs at the same time and returns both responses for a side-by-side comparison.
