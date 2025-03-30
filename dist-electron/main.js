"use strict";
const electron = require("electron");
const path = require("node:path");
const keytar = require("keytar");
const axios = require("axios");
const fs = require("fs/promises");
const Store = require("electron-store");
const node_crypto = require("node:crypto");
const KEYTAR_SERVICE_NAME = "ContextCraftLLMKeys";
let storeInstance;
const StoreConstructor = Store.default || Store;
try {
  storeInstance = new StoreConstructor();
} catch (e) {
  console.warn("Direct Store construction failed, attempting fallback:", e);
  storeInstance = Store;
}
const store = storeInstance;
if (require("electron-squirrel-startup")) {
  electron.app.quit();
}
const createWindow = () => {
  const mainWindow = new electron.BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      // Reverted back to .js
      contextIsolation: true,
      // Recommended for security
      nodeIntegration: false
      // Recommended for security
    }
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/index.html`));
  }
  return mainWindow;
};
electron.app.whenReady().then(() => {
  const mainWindow = createWindow();
  electron.ipcMain.handle("dialog:openDirectory", async () => {
    const { canceled, filePaths } = await electron.dialog.showOpenDialog(mainWindow, {
      // Pass window reference
      properties: ["openDirectory"]
    });
    if (!canceled && filePaths.length > 0) {
      return filePaths[0];
    }
    return void 0;
  });
  async function analyzeDirectoryRecursive(dirPath, currentWindow) {
    let structure = [];
    const ignoreDirs = [
      "node_modules",
      ".git",
      ".vscode",
      "dist",
      "out",
      "build",
      "target",
      // Common build/tooling dirs
      "__pycache__",
      "venv",
      ".venv",
      "env",
      ".env",
      // Python virtual envs
      ".next",
      ".nuxt",
      // Framework build dirs
      "coverage"
      // Test coverage reports
      // Add more directories as needed
    ];
    const ignoreFiles = [
      ".DS_Store",
      "Thumbs.db",
      // OS specific
      ".env",
      ".env.*",
      // Environment files (sensitive)
      "*.log",
      // Log files
      "package-lock.json",
      "yarn.lock",
      "pnpm-lock.yaml"
      // Lock files (often too large/noisy)
      // Add more file patterns (e.g., '*.pyc')
    ];
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && ignoreDirs.includes(entry.name)) continue;
        if (entry.isFile() && ignoreFiles.includes(entry.name)) continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          const children = await analyzeDirectoryRecursive(fullPath, currentWindow);
          structure.push({
            path: fullPath,
            name: entry.name,
            type: "directory",
            children
            // Add children if it's a directory
          });
        } else {
          structure.push({
            path: fullPath,
            name: entry.name,
            type: "file"
          });
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
      currentWindow.webContents.send("analysis-error", `Error reading ${dirPath}`);
    }
    return structure;
  }
  electron.ipcMain.handle("analysis:analyzeDirectory", async (event, dirPath) => {
    const currentWindow = electron.BrowserWindow.fromWebContents(event.sender);
    if (!currentWindow) {
      console.error("Could not find window for analysis request.");
      return "Error: Could not find window.";
    }
    console.log(`Analyzing directory: ${dirPath}`);
    try {
      const analysisResult = await analyzeDirectoryRecursive(dirPath, currentWindow);
      console.log(`Analysis complete for: ${dirPath}`);
      return analysisResult;
    } catch (error) {
      console.error("Analysis failed:", error);
      return `Error during analysis: ${error instanceof Error ? error.message : String(error)}`;
    }
  });
  electron.ipcMain.handle("file:readFileContent", async (_, filePath) => {
    console.log(`Reading content for: ${filePath}`);
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return content;
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      return null;
    }
  });
  electron.ipcMain.handle("llm:getConfigs", async () => {
    const configs = store.get("llmConfigs", []);
    return configs;
  });
  electron.ipcMain.handle("llm:addConfig", async (_, configData, apiKey) => {
    try {
      const newId = node_crypto.randomUUID();
      const apiKeyId = newId;
      const newConfig = {
        ...configData,
        id: newId,
        apiKeyId
      };
      await keytar.setPassword(KEYTAR_SERVICE_NAME, apiKeyId, apiKey);
      const currentConfigs = store.get("llmConfigs", []);
      currentConfigs.push(newConfig);
      store.set("llmConfigs", currentConfigs);
      console.log(`Added LLM config: ${newConfig.name} (ID: ${newId})`);
      return newConfig;
    } catch (error) {
      console.error("Error adding LLM config:", error);
      return null;
    }
  });
  electron.ipcMain.handle("llm:updateConfig", async (_, config, apiKey) => {
    try {
      const currentConfigs = store.get("llmConfigs", []);
      const configIndex = currentConfigs.findIndex((c) => c.id === config.id);
      if (configIndex === -1) {
        console.error(`Config with ID ${config.id} not found for update.`);
        return false;
      }
      if (apiKey) {
        await keytar.setPassword(KEYTAR_SERVICE_NAME, config.apiKeyId, apiKey);
        console.log(`Updated API key for config ID: ${config.id}`);
      }
      currentConfigs[configIndex] = config;
      store.set("llmConfigs", currentConfigs);
      console.log(`Updated LLM config: ${config.name} (ID: ${config.id})`);
      return true;
    } catch (error) {
      console.error("Error updating LLM config:", error);
      return false;
    }
  });
  electron.ipcMain.handle("llm:deleteConfig", async (_, configId) => {
    try {
      const currentConfigs = store.get("llmConfigs", []);
      const configToDelete = currentConfigs.find((c) => c.id === configId);
      if (!configToDelete) {
        console.error(`Config with ID ${configId} not found for deletion.`);
        return false;
      }
      await keytar.deletePassword(KEYTAR_SERVICE_NAME, configToDelete.apiKeyId);
      const updatedConfigs = currentConfigs.filter((c) => c.id !== configId);
      store.set("llmConfigs", updatedConfigs);
      console.log(`Deleted LLM config ID: ${configId}`);
      return true;
    } catch (error) {
      console.error("Error deleting LLM config:", error);
      return false;
    }
  });
  electron.ipcMain.handle("llm:sendPrompt", async (_, payload) => {
    var _a, _b, _c, _d, _e, _f;
    const { context, query, configId, model } = payload;
    console.log(`Sending prompt using config ${configId} and model ${model}...`);
    const configs = store.get("llmConfigs", []);
    const selectedConfig = configs.find((c) => c.id === configId);
    if (!selectedConfig) {
      console.error(`Configuration with ID ${configId} not found.`);
      throw new Error(`Configuration with ID ${configId} not found.`);
    }
    const apiKey = await keytar.getPassword(KEYTAR_SERVICE_NAME, selectedConfig.apiKeyId);
    if (!apiKey) {
      console.error(`API Key for config ${configId} (key ID: ${selectedConfig.apiKeyId}) not found using service ${KEYTAR_SERVICE_NAME}.`);
      throw new Error(`API Key for configuration "${selectedConfig.name}" not found. Please check settings.`);
    }
    const baseEndpoint = selectedConfig.apiEndpoint.endsWith("/") ? selectedConfig.apiEndpoint.slice(0, -1) : selectedConfig.apiEndpoint;
    const apiPath = "/chat/completions";
    const apiUrl = `${baseEndpoint}${apiPath}`;
    console.log(`Target API URL: ${apiUrl}`);
    try {
      const response = await axios.post(apiUrl, {
        model,
        // Use the selected model from payload
        messages: [
          { role: "system", content: `Based on the following project context:

${context}

Answer the user's query.` },
          // Keep or adjust system prompt
          { role: "user", content: query }
        ]
        // Add parameters like temperature, max_tokens if needed
      }, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        }
      });
      console.log(`Received response using model ${model}.`);
      return ((_b = (_a = response.data.choices[0]) == null ? void 0 : _a.message) == null ? void 0 : _b.content) || "No response content received.";
    } catch (error) {
      const errorMessage = ((_e = (_d = (_c = error.response) == null ? void 0 : _c.data) == null ? void 0 : _d.error) == null ? void 0 : _e.message) || error.message;
      console.error(`API Error for ${selectedConfig.name} (${model}):`, errorMessage, (_f = error.response) == null ? void 0 : _f.data);
      throw new Error(`API request failed: ${errorMessage}`);
    }
  });
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
