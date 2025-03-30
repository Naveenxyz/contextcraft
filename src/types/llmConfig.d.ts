export interface LLMConfig {
  id: string; // Unique identifier (e.g., UUID)
  name: string; // User-friendly name (e.g., "Groq Llama3 70b", "OpenAI GPT-4o")
  apiEndpoint: string; // Base URL for the API (e.g., "https://api.openai.com/v1", "https://api.groq.com/openai/v1")
  apiKeyId: string; // Identifier used to store/retrieve the API key via keytar (could be same as id or derived)
  models: string[]; // List of available model names for this endpoint (can be manually entered or fetched)
  defaultModel?: string; // Optional: The default model to select for this config
}