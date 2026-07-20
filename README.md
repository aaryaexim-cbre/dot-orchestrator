# dot-orchestrator

Hackathon experiment — side-by-side AI orchestration demo. Not part of AaryaExim.ai production systems.

## Run locally

1. Add API keys and model IDs for both providers to your shell or a local process manager:
   ```bash
   export OPENROUTER_API_KEY=your_openrouter_api_key
   export OPENROUTER_MODEL_A=deepseek/deepseek-r1:free
   export GEMINI_API_KEY=your_gemini_api_key
   export GEMINI_MODEL=gemini-2.5-flash
   ```
2. Start the web app:
   ```bash
   npm start
   ```
3. Open [http://localhost:3000](http://localhost:3000).

The app has one text input. When you submit a message, the Node server sends the prompt to OpenRouter for Model A and directly to Google's Gemini API for Model B, then returns both structured responses for a side-by-side comparison.
