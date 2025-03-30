var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
import { app, ipcMain, dialog, BrowserWindow } from "electron";
import path from "node:path";
import keytar from "keytar";
import axios from "axios";
import fs from "fs/promises";
var require_main = __commonJS({
  "main.cjs"() {
    const SERVICE_NAME = "ContextCraft";
    if (require("electron-squirrel-startup")) {
      app.quit();
    }
    const createWindow = () => {
      const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          // Load the .cjs file
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
    app.whenReady().then(() => {
      const mainWindow = createWindow();
      ipcMain.handle("dialog:openDirectory", async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
          // Pass window reference
          properties: ["openDirectory"]
        });
        if (!canceled && filePaths.length > 0) {
          return filePaths[0];
        }
        return void 0;
      });
      ipcMain.handle("secure:getApiKey", async (_, llmService) => {
        try {
          console.log(`Attempting to get key for service: ${llmService}`);
          const key = await keytar.getPassword(SERVICE_NAME, llmService);
          console.log(`Retrieved key for ${llmService}: ${key ? "Exists" : "Not Found"}`);
          return key;
        } catch (error) {
          console.error(`Error retrieving API key for ${llmService}:`, error);
          return null;
        }
      });
      ipcMain.handle("secure:setApiKey", async (_, llmService, apiKey) => {
        try {
          console.log(`Attempting to set key for service: ${llmService}`);
          await keytar.setPassword(SERVICE_NAME, llmService, apiKey);
          console.log(`API key for ${llmService} stored securely.`);
        } catch (error) {
          console.error(`Error storing API key for ${llmService}:`, error);
          throw new Error(`Failed to store API key for ${llmService}.`);
        }
      });
      async function analyzeDirectoryRecursive(dirPath, currentWindow, level = 0) {
        let structure = [];
        const ignoreList = ["node_modules", ".git", ".vscode", "dist", "out"];
        try {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          for (const entry of entries) {
            if (ignoreList.includes(entry.name)) continue;
            const fullPath = path.join(dirPath, entry.name);
            const prefix = "  ".repeat(level);
            if (entry.isDirectory()) {
              structure.push(`${prefix}📁 ${entry.name}`);
              structure = structure.concat(await analyzeDirectoryRecursive(fullPath, currentWindow, level + 1));
            } else {
              structure.push(`${prefix}📄 ${entry.name}`);
            }
          }
        } catch (error) {
          console.error(`Error reading directory ${dirPath}:`, error);
          currentWindow.webContents.send("analysis-error", `Error reading ${dirPath}`);
        }
        return structure;
      }
      ipcMain.handle("analysis:analyzeDirectory", async (event, dirPath) => {
        const currentWindow = BrowserWindow.fromWebContents(event.sender);
        if (!currentWindow) {
          console.error("Could not find window for analysis request.");
          return "Error: Could not find window.";
        }
        console.log(`Analyzing directory: ${dirPath}`);
        try {
          const analysisResult = await analyzeDirectoryRecursive(dirPath, currentWindow);
          const context = `Project Structure: ${dirPath}

${analysisResult.join("\n")}`;
          console.log(`Analysis complete for: ${dirPath}`);
          return context;
        } catch (error) {
          console.error("Analysis failed:", error);
          return `Error during analysis: ${error instanceof Error ? error.message : String(error)}`;
        }
      });
      ipcMain.handle("llm:sendPrompt", async (_, payload) => {
        var _a, _b, _c, _d, _e, _f;
        const { context, query, llm } = payload;
        console.log(`Sending prompt to ${llm}... Query: ${query.substring(0, 50)}...`);
        const apiKey = await keytar.getPassword(SERVICE_NAME, llm);
        if (!apiKey) {
          console.error(`API Key for ${llm} not found.`);
          throw new Error(`API Key for ${llm} not found. Please set it in Settings.`);
        }
        if (llm === "OpenAI") {
          try {
            const response = await axios.post("https://api.openai.com/v1/chat/completions", {
              model: "gpt-3.5-turbo",
              // Make configurable later
              messages: [
                { role: "system", content: `Based on the following project context:

${context}

Answer the user's query.` },
                { role: "user", content: query }
              ]
              // Add parameters like temperature, max_tokens if needed
            }, {
              headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
              }
            });
            console.log(`Received response from ${llm}.`);
            return ((_b = (_a = response.data.choices[0]) == null ? void 0 : _a.message) == null ? void 0 : _b.content) || "No response content received.";
          } catch (error) {
            const errorMessage = ((_e = (_d = (_c = error.response) == null ? void 0 : _c.data) == null ? void 0 : _d.error) == null ? void 0 : _e.message) || error.message;
            console.error("OpenAI API Error:", errorMessage, (_f = error.response) == null ? void 0 : _f.data);
            throw new Error(`API request failed: ${errorMessage}`);
          }
        } else {
          console.error(`LLM service "${llm}" not implemented.`);
          throw new Error(`LLM service "${llm}" not implemented yet.`);
        }
      });
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
      });
    });
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    });
  }
});
export default require_main();
