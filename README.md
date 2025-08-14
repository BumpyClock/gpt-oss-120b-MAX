![logo](doc/logo.webp)

Ever dreamt of accessing on your remote server an IDE using a local LLM tool... running a remote LLM just for the sake of AIception?

Well, considering how much time it took to answer locally on my M4 Max 64 GB of RAM...

https://github.com/user-attachments/assets/91eae390-e1d7-45bf-a724-62b13fc281a5

and that's `gpt-oss-20b`...

## The Problem

The current tools does not support Ollama headers to send the bearer and access to powerful remote models like `gpt-oss-120b` and `gpt-oss-20b`, but most IDEs and AI tools accepts OpenAI's API format. This server solves that by:

- **Providing OpenAI-compatible API** that tools recognize
- **Exposing remote Turbo models** through familiar OpenAI format
- **Providing blazing fast performance** through Ollama's Turbo infrastructure
- **Enabling seamless integration** with any OpenAI-compatible tool

## Setup

1. **Install dependencies:**
```bash
bun install
```

2. **Get your Ollama Turbo API key:**
   - Sign up for Ollama Turbo subscription
   - Get your API key from the Ollama dashboard https://ollama.com/settings/keys

3. **Set up environment:**
```bash
cp .env.example .env
```
and then edit the `OLLAMA_API_KEY` var env with your key.

4. **Start the server:**
```bash
# Start the OpenAI-compatible server
bun run start-ollama-turbo

# Development with auto-reload
bun run dev
```

For RooCode/Kilocode `bun run start` also starts qdrant locally for code embedding / indexing

## Environment Variables

- `OLLAMA_API_KEY` - Your Ollama Turbo API key (required)
- `OLLAMA_HOST` - Ollama Turbo host (default: https://ollama.com) - ⚠️ changing this will disable Turbo mode
- `OPENAI_PORT` - Server port (default: 3304)

## IDE Integration

### VS Code, Cursor with AI Extensions or JetBrains AI
Configure your AI extension to use:
- Base URL: `http://localhost:3304/v1`
- API Key: `any-key-does-not-matter`
- **Select models:**
   - `gpt-oss:120b`
   - `gpt-oss:20b`

## API Usage Examples

```bash
# List available models
curl -X GET http://localhost:3304/v1/models

# Chat completion (non-streaming)
curl -X POST http://localhost:3304/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-oss:20b",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'

# Chat completion (streaming)
curl -X POST http://localhost:3304/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-oss:120b",
    "messages": [
      {"role": "user", "content": "Write a short story"}
    ],
    "stream": true
  }'
```

## Compatibility

Works with any tool that supports OpenAI API:
- ✅ **JetBrains AI Assistant**
- ✅ **VS Code AI Extensions** RooCode supports only openAI, Kilocode works with ollama proxy 3305
- ✅ **Cursor IDE**
- ✅ **Any OpenAI-compatible application**

## Performance

Thanks to Ollama's Turbo infrastructure:
- ⚡ **Blazing fast responses** (much faster than local models)
- 🚀 **No local GPU required** 
- 💾 **No model downloads** (instant startup)
- 🌐 **Cloud-powered inference**



