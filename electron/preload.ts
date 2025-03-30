import { contextBridge, ipcRenderer } from 'electron';
// Import the type definition - Adjust path if necessary, assuming types are shared or copied
// For simplicity, let's assume a shared types directory or duplicate the definition here if needed.
// If using shared types, ensure tsconfig paths are set up correctly.
// Let's redefine it here for simplicity in this step:
interface LLMConfig {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKeyId: string;
  models: string[];
  defaultModel?: string;
}


// Define the API structure that will be exposed to the renderer process
const electronAPI = {
  // Renderer -> Main (Invoke/Handle pattern)
  openDirectoryDialog: (): Promise<string | undefined> =>
    ipcRenderer.invoke('dialog:openDirectory'),
  getApiKey: (service: string): Promise<string | null> =>
    ipcRenderer.invoke('secure:getApiKey', service),
  setApiKey: (service: string, apiKey: string): Promise<void> => // Keep for now
    ipcRenderer.invoke('secure:setApiKey', service, apiKey),
  // Remove old sendPrompt
  // sendPrompt: (payload: { context: string; query: string; configId: string; model: string; }): Promise<string> =>
  //   ipcRenderer.invoke('llm:sendPrompt', payload),
  // Add function to initiate stream request
  sendPromptStreamRequest: (payload: { context: string; query: string; configId: string; model: string; }): void =>
    ipcRenderer.send('llm:sendStreamRequest', payload), // Use ipcRenderer.send for one-way trigger
  // Update return type to match main process handler
  analyzeDirectory: (path: string): Promise<any[] | string> => // Use 'any[]' for now, define DirectoryItem in shared types later if needed
    ipcRenderer.invoke('analysis:analyzeDirectory', path),
  readFileContent: (path: string): Promise<string | null> => // Expose file reading
    ipcRenderer.invoke('file:readFileContent', path),

  // LLM Configuration Management
  getLLMConfigs: (): Promise<LLMConfig[]> => ipcRenderer.invoke('llm:getConfigs'),
  // Use Omit for addConfig as ID/apiKeyId are generated in main process
  addLLMConfig: (config: Omit<LLMConfig, 'id' | 'apiKeyId'>, apiKey: string): Promise<LLMConfig | null> => ipcRenderer.invoke('llm:addConfig', config, apiKey),
  updateLLMConfig: (config: LLMConfig, apiKey?: string): Promise<boolean> => ipcRenderer.invoke('llm:updateConfig', config, apiKey),
  deleteLLMConfig: (configId: string): Promise<boolean> => ipcRenderer.invoke('llm:deleteConfig', configId),
  fetchModelsForConfig: (configId: string): Promise<string[] | null> => ipcRenderer.invoke('llm:fetchModels', configId),

  // Main -> Renderer (Send/On pattern - requires cleanup)
  onUpdateContext: (callback: (context: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, context: string) => callback(context);
    ipcRenderer.on('update-context', handler);
    // Return a cleanup function
    return () => ipcRenderer.removeListener('update-context', handler);
  },
  onAnalysisProgress: (callback: (progress: number) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: number) => callback(progress);
    ipcRenderer.on('analysis-progress', handler);
    // Return a cleanup function
    return () => ipcRenderer.removeListener('analysis-progress', handler);
  },
   onAnalysisError: (callback: (errorMsg: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, errorMsg: string) => callback(errorMsg);
    ipcRenderer.on('analysis-error', handler);
    // Return a cleanup function
    return () => ipcRenderer.removeListener('analysis-error', handler);
  },
  // LLM Streaming Listeners
  onLLMChunk: (callback: (chunk: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string) => callback(chunk);
    ipcRenderer.on('llm:chunk', handler);
    return () => ipcRenderer.removeListener('llm:chunk', handler);
  },
  onLLMStreamEnd: (callback: () => void) => {
    const handler = (_event: Electron.IpcRendererEvent) => callback();
    ipcRenderer.on('llm:streamEnd', handler);
    return () => ipcRenderer.removeListener('llm:streamEnd', handler);
  },
  onLLMStreamError: (callback: (errorMsg: string) => void) => {
     const handler = (_event: Electron.IpcRendererEvent, errorMsg: string) => callback(errorMsg);
    ipcRenderer.on('llm:streamError', handler);
    return () => ipcRenderer.removeListener('llm:streamError', handler);
  },

  // Utility to remove all listeners for a channel if needed (use carefully)
  removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
};

// Expose the defined API to the window object in a secure way
try {
  contextBridge.exposeInMainWorld('electronAPI', electronAPI);
  console.log('electronAPI exposed successfully.');
} catch (error) {
  console.error('Failed to expose electronAPI:', error);
}

// It's good practice to also define the types for the exposed API
// We'll create a src/types/electron.d.ts file for this later.