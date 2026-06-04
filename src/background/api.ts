// The ONLY entry point for all LLM calls. Business logic never touches provider details.
// Routes to callAnthropic() or callOpenAICompatible(baseUrl, request) based on provider.
// TODO: Phase 3 — implement callModel(), provider routing, context truncation, streaming

export {}
