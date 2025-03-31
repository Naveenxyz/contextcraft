// Defines the structure for a single message in the chat history

export interface ChatMessage {
  id: string; // Unique ID for each message
  role: 'user' | 'assistant' | 'system'; // Role of the sender
  content: string; // Message content
}