var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
import { contextBridge, ipcRenderer } from "electron";
var require_preload = __commonJS({
  "preload.cjs"() {
    const electronAPI = {
      // Renderer -> Main (Invoke/Handle pattern)
      openDirectoryDialog: () => ipcRenderer.invoke("dialog:openDirectory"),
      getApiKey: (service) => ipcRenderer.invoke("secure:getApiKey", service),
      setApiKey: (service, apiKey) => ipcRenderer.invoke("secure:setApiKey", service, apiKey),
      sendPrompt: (payload) => ipcRenderer.invoke("llm:sendPrompt", payload),
      analyzeDirectory: (path) => ipcRenderer.invoke("analysis:analyzeDirectory", path),
      // Main -> Renderer (Send/On pattern - requires cleanup)
      onUpdateContext: (callback) => {
        const handler = (_event, context) => callback(context);
        ipcRenderer.on("update-context", handler);
        return () => ipcRenderer.removeListener("update-context", handler);
      },
      onAnalysisProgress: (callback) => {
        const handler = (_event, progress) => callback(progress);
        ipcRenderer.on("analysis-progress", handler);
        return () => ipcRenderer.removeListener("analysis-progress", handler);
      },
      onAnalysisError: (callback) => {
        const handler = (_event, errorMsg) => callback(errorMsg);
        ipcRenderer.on("analysis-error", handler);
        return () => ipcRenderer.removeListener("analysis-error", handler);
      },
      // Utility to remove all listeners for a channel if needed (use carefully)
      removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
    };
    try {
      contextBridge.exposeInMainWorld("electronAPI", electronAPI);
      console.log("electronAPI exposed successfully.");
    } catch (error) {
      console.error("Failed to expose electronAPI:", error);
    }
  }
});
export default require_preload();
