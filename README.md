# dot-orchestrator

Hackathon experiment — side-by-side AI orchestration demo. Not part of AaryaExim.ai production systems.

## Run locally

1. Add API keys to your shell or a local process manager:
   ```bash
   export OPENAI_API_KEY=your_openai_api_key
   export ANTHROPIC_API_KEY=your_anthropic_api_key
   ```
2. Start the web app:
   ```bash
   npm start
   ```
3. Open [http://localhost:3000](http://localhost:3000).

The app has one text input. When you submit a message, the Node server sends the prompt to the OpenAI and Anthropic APIs at the same time and returns both responses for a side-by-side comparison.
