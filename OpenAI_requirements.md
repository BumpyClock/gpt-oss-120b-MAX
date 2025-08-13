Short answer: Implement a strict, faithful clone of OpenAI’s v1 Chat Completions API semantics and wire-compatibility, including tool/function calling, streaming, JSON/Structured Outputs, and model metadata, because RooCode/KiloCode speak to “OpenAI-compatible” endpoints expecting exact request/response shapes and edge-case behaviors.[1][2][3]

Core surface area to implement
- Endpoints: Provide /v1/models (list), /v1/chat/completions (must-have), and optionally /v1/completions and /v1/embeddings for broader library compatibility; RooCode/KiloCode primarily rely on /v1/chat/completions and model listing.[3][1]
- Auth and headers: Accept Authorization: Bearer , support Organization headers when present, and handle missing/invalid keys with OpenAI-style 401/403 error envelopes.[4][1]
- Models: Return model ids in /v1/models that exactly match what users configure in the editor; many clients preflight by listing models or expect 404 if a requested model is unknown.[1][3]
- Request schema: Fully support messages[], roles (system/user/assistant/tool), name, content strings, temperature/top_p, max_tokens, stop, presence/frequency penalties, logprobs/top_logprobs, user, and the tools/function-calling fields (tools[], tool_choice, function.name/parameters) used by modern agents.[5][1]
- Tool/function calling: Implement OpenAI’s function calling contract with message.tool_calls, type=function, id, function.name, function.arguments (stringified JSON), and accept tool messages with role=tool and tool_call_id on the next turn.[5][1]
- Streaming: Implement Server-Sent Events via stream=true with data: chunks that mirror OpenAI delta structure, including tool_calls deltas, finish_reason, and a final [DONE] sentinel; many IDE agents depend on SSE for interactivity.[3][1]
- Errors: Use OpenAI-style JSON error envelopes {error:{message,type,code}} and appropriate HTTP status codes; RooCode surfaces these directly.[4][1]
- Rate limits and headers: It is helpful to mirror rate-limit headers (x-ratelimit-*) and request ids (x-request-id) to match client expectations and debugging patterns, though not strictly required.[1]

Behavioral fidelity that trips clients
- “Always return an assistant message”: Never finish a non-streaming response without choices.message.role="assistant" and a content string or a tool_calls array; many agents raise “The language model did not provide any assistant messages” if the assistant message is missing or only tool metadata is returned.[6][7]
- Tool-calls plus text: Support responses that include both content and tool_calls, and ensure the structure matches OpenAI’s arrays and fields; incorrectly omitting message or nesting tool_calls outside the assistant message breaks clients.[5][1]
- Finish reasons: Populate finish_reason (stop, length, content_filter, tool_calls) identically to OpenAI; some UIs branch on these values.[3][1]
- JSON/Structured outputs: Implement response_format with type:"json_object" (JSON mode) and type:"json_schema" for structured outputs matching the current OpenAI spec; mismatches here are a common source of “compatible-but-not-really” issues.[8][9][10]
- Reasoning models: If exposing “reasoning” style outputs, ensure assistant message text remains present or map reasoning traces to OpenAI’s output fields so clients don’t see an empty content despite extra metadata.[6][4]

Concrete response shapes to mirror
- Non-streaming chat: Return {id,object:"chat.completion",created,model,choices:[{index,finish_reason,message:{role:"assistant",content:"...",tool_calls:[...]}}],usage:{...}} exactly as OpenAI does for chat/completions; several “OpenAI-compatible” servers mistakenly return only a free-form text field.[1][3]
- Streaming chat: Send event stream with incremental choices.delta.content or choices.delta.tool_calls entries and choices.finish_reason at the end, followed by data: [DONE]; partial tool_calls must arrive as per OpenAI’s chunking behavior.[3][1]
- Tools: In requests, accept tools:[{type:"function",function:{name,description,parameters(JSON Schema)}}]; in responses, emit message.tool_calls:[{id,type:"function",function:{name,arguments}}]; arguments must be a JSON string, not an object.[5][1]

Compatibility checklist for RooCode/KiloCode
- Base URL: Accept a configurable base URL and do not require extra path segments beyond /v1; many clients simply swap baseUrl.[2][11]
- Model IDs: Support arbitrary model id strings and ensure they are consistent between /v1/models and calls; mismatches cause 404/400 or selection UI failures.[1][3]
- CORS and preflight: Enable standard CORS for desktop extensions using fetch; failures here look like network errors in the IDE.[3]
- Timeouts and keep-alive: Keep SSE connections stable and send periodic chunks; premature close during streaming triggers “Invalid response body” or “Premature close” in RooCode.[12][3]
- Error text readability: Populate error.message with actionable text; RooCode forwards these, aiding user troubleshooting.[12]

Known edge cases to handle
- response_format json_schema: Follow OpenAI’s latest contract; several “compatible” servers implement only json_object and not schema adherence, which breaks clients relying on structured outputs.[9][8]
- Tool-call-only turns: If the model decides to call tools with no immediate text, still return a valid assistant message containing tool_calls; do not omit the assistant message wrapper.[5][1]
- Empty content normalization: If upstream model yields only whitespace, coerce to empty string content to avoid “no assistant message” assertions in clients expecting presence.[7][6]
- Large outputs and truncation: Respect max_tokens and return finish_reason="length" with partial content rather than closing the stream abruptly.[1][3]

Testing plan to validate 100% compatibility
- Golden tests using OpenAI SDKs: Run the official Python/JS OpenAI SDKs against your server for chat/completions with tools, streaming, stop sequences, and response_format=json_object/json_schema, and compare responses to OpenAI’s schema.[10][1]
- RooCode/KiloCode smoke tests: Point RooCode/KiloCode to your base URL, select your model id, and run tasks that invoke read/edit/run-command tools to confirm tool-call loops are unbroken and assistant messages always present.[2][3]
- Adversarial cases: Test tool-calls with large argument payloads, multiple parallel tool_calls, empty content with tool_calls, long streaming sessions, and malformed inputs to ensure graceful error envelopes.[5][3]

References for exact behavior
- OpenAI API reference for Chat Completions, function calling, streaming, and error envelope shapes.[5][1]
- Structured Outputs and JSON mode semantics and supported models; mirror request/response fields even if your backend only approximates adherence.[8][10]
- vLLM OpenAI-compatible server docs show a faithful implementation surface and streaming/tool examples useful as a baseline.[3]
- Issues from field integrations highlight common pitfalls: missing assistant message on completion, partial SSE, or response_format mismatches.[9][7][6]

Bottom line: Treat “OpenAI compatible” as wire-level compatibility with the current /v1/chat/completions contract, including tools and SSE, plus correct response_format handling and predictable assistant message presence; test with OpenAI SDKs and RooCode end-to-end to catch any edge-case regressions before release.[2][1][3]

[1] https://platform.openai.com/docs/api-reference/chat/create
[2] https://docs.roocode.com/getting-started/connecting-api-provider
[3] https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html
[4] https://platform.openai.com/docs/api-reference/introduction
[5] https://platform.openai.com/docs/guides/function-calling
[6] https://github.com/cline/cline/issues/4762
[7] https://github.com/RooCodeInc/Roo-Code/issues/6999
[8] https://platform.openai.com/docs/guides/structured-outputs
[9] https://github.com/ggml-org/llama.cpp/issues/11847
[10] https://platform.openai.com/docs/guides/text
[11] https://docs.litellm.ai/docs/providers/openai_compatible
[12] https://github.com/RooCodeInc/Roo-Code/issues/5724
[13] https://community.openai.com/t/official-documentation-for-supported-schemas-for-response-format-parameter-in-calls-to-client-beta-chats-completions-parse/932422
[14] https://community.openai.com/t/how-do-i-use-the-new-json-mode/475890
[15] https://console.settlemint.com/documentation/blockchain-and-ai/ai-code-assistant
[16] https://community.openai.com/t/how-can-i-use-function-calling-with-response-format-structured-output-feature-for-final-response/965784
[17] https://devblogs.microsoft.com/semantic-kernel/using-json-schema-for-structured-output-in-net-for-openai-models/
[18] https://model-spec.openai.com
[19] https://learn.microsoft.com/en-us/answers/questions/2258458/bug-in-response-format
[20] https://ai.google.dev/gemini-api/docs/openai
[21] https://learn.microsoft.com/en-us/azure/ai-foundry/openai/reference
[22] https://github.com/RooVetGit/Roo-Code/issues/529