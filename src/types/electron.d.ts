// This file defines the TypeScript types for the API exposed by electron/preload.ts
// It allows the React renderer process to use window.electronAPI with type safety.

// Define the structure for directory items returned by analysis
export interface DirectoryItem {
  path: string;
  name: string;
  type: 'file' | 'directory';
  children?: DirectoryItem[];
}

// Import LLMConfig type
import { LLMConfig } from './llmConfig';

export interface IElectronAPI {
  // Renderer -> Main (Invoke/Handle)
  openDirectoryDialog: () => Promise<string | undefined>;
  getApiKey: (service: string) => Promise<string | null>; // Keep for now
  setApiKey: (service: string, apiKey: string) => Promise<void>; // Keep for now
  // Remove old sendPrompt
  // sendPrompt: (payload: { context: string; query: string; configId: string; model: string; }) => Promise<string>;
  // Add function to initiate stream request (Renderer -> Main)
  sendPromptStreamRequest: (payload: { context: string; query: string; configId: string; model: string; }) => void;
  // Update return type for analyzeDirectory
  analyzeDirectory: (path: string) => Promise<DirectoryItem[] | string>; // Returns tree structure or error string
  readFileContent: (path: string) => Promise<string | null>; // Add function to read file content

  // LLM Configuration Management
  getLLMConfigs: () => Promise<LLMConfig[]>;
  addLLMConfig: (config: Omit<LLMConfig, 'id' | 'apiKeyId'>, apiKey: string) => Promise<LLMConfig | null>; // Returns the added config with ID or null on error
  updateLLMConfig: (config: LLMConfig, apiKey?: string) => Promise<boolean>; // Update config, optionally update API key too
  deleteLLMConfig: (configId: string) => Promise<boolean>; // Delete config and associated API key
  fetchModelsForConfig: (configId: string) => Promise<string[] | null>; // Fetch models for a config

  // Main -> Renderer (Send/On)
  // These functions now return a cleanup function to remove the listener
  onUpdateContext: (callback: (context: string) => void) => () => void;
  onAnalysisProgress: (callback: (progress: number) => void) => () => void;
  onAnalysisError: (callback: (errorMsg: string) => void) => () => void;
  // LLM Streaming Listeners (Main -> Renderer)
  onLLMChunk: (callback: (chunk: string) => void) => () => void; // Receives text chunks
  onLLMStreamEnd: (callback: () => void) => () => void; // Signals stream completion
  onLLMStreamError: (callback: (errorMsg: string) => void) => () => void; // Signals stream error

  // Utility
  removeAllListeners: (channel: string) => void;
}

// Augment the global Window interface
declare global {
  interface Window {
    electronAPI: IElectronAPI;
  }
}