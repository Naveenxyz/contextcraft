"use strict";
const electron = require("electron");
const electronAPI = {
  // Renderer -> Main (Invoke/Handle pattern)
  openDirectoryDialog: () => electron.ipcRenderer.invoke("dialog:openDirectory"),
  getApiKey: (service) => electron.ipcRenderer.invoke("secure:getApiKey", service),
  setApiKey: (service, apiKey) => (
    // Keep for now
    electron.ipcRenderer.invoke("secure:setApiKey", service, apiKey)
  ),
  // Update sendPrompt payload type
  sendPrompt: (payload) => electron.ipcRenderer.invoke("llm:sendPrompt", payload),
  // Ensure channel name matches main process handler
  // Update return type to match main process handler
  analyzeDirectory: (path) => (
    // Use 'any[]' for now, define DirectoryItem in shared types later if needed
    electron.ipcRenderer.invoke("analysis:analyzeDirectory", path)
  ),
  readFileContent: (path) => (
    // Expose file reading
    electron.ipcRenderer.invoke("file:readFileContent", path)
  ),
  // LLM Configuration Management
  getLLMConfigs: () => electron.ipcRenderer.invoke("llm:getConfigs"),
  // Use Omit for addConfig as ID/apiKeyId are generated in main process
  addLLMConfig: (config, apiKey) => electron.ipcRenderer.invoke("llm:addConfig", config, apiKey),
  updateLLMConfig: (config, apiKey) => electron.ipcRenderer.invoke("llm:updateConfig", config, apiKey),
  deleteLLMConfig: (configId) => electron.ipcRenderer.invoke("llm:deleteConfig", configId),
  // Main -> Renderer (Send/On pattern - requires cleanup)
  onUpdateContext: (callback) => {
    const handler = (_event, context) => callback(context);
    electron.ipcRenderer.on("update-context", handler);
    return () => electron.ipcRenderer.removeListener("update-context", handler);
  },
  onAnalysisProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    electron.ipcRenderer.on("analysis-progress", handler);
    return () => electron.ipcRenderer.removeListener("analysis-progress", handler);
  },
  onAnalysisError: (callback) => {
    const handler = (_event, errorMsg) => callback(errorMsg);
    electron.ipcRenderer.on("analysis-error", handler);
    return () => electron.ipcRenderer.removeListener("analysis-error", handler);
  },
  // Utility to remove all listeners for a channel if needed (use carefully)
  removeAllListeners: (channel) => electron.ipcRenderer.removeAllListeners(channel)
};
try {
  electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
  console.log("electronAPI exposed successfully.");
} catch (error) {
  console.error("Failed to expose electronAPI:", error);
}
