"use strict";
const electron = require("electron");
const path$1 = require("node:path");
const keytar = require("keytar");
const axios = require("axios");
const fs = require("fs/promises");
const Store = require("electron-store");
const node_crypto = require("node:crypto");
const sqlite3 = require("sqlite3");
const path = require("path");
const sqlite = sqlite3.verbose();
const dbPath = path.join(electron.app.getPath("userData"), "projects.db");
let db = null;
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite.Database(dbPath, (err) => {
      if (err) {
        console.error("Error opening database:", err.message);
        reject(err);
      } else {
        console.log("Connected to the SQLite database.");
        db == null ? void 0 : db.run(`CREATE TABLE IF NOT EXISTS projects (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          folderPath TEXT NOT NULL UNIQUE,
          name TEXT,
          lastAccessed DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err2) => {
          if (err2) {
            console.error("Error creating projects table:", err2.message);
            reject(err2);
          } else {
            console.log("Projects table checked/created successfully.");
            resolve();
          }
        });
      }
    });
  });
};
const addProject = (folderPath, name) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error("Database not initialized."));
    }
    const projectName = path.basename(folderPath);
    const sql = `INSERT OR IGNORE INTO projects (folderPath, name, lastAccessed) VALUES (?, ?, ?)`;
    db.run(sql, [folderPath, projectName, (/* @__PURE__ */ new Date()).toISOString()], function(err) {
      if (err) {
        console.error("Error adding project:", err.message);
        reject(err);
      } else {
        if (this.lastID > 0) {
          console.log(`Project added/updated with ID: ${this.lastID}`);
          resolve(this.lastID);
        } else {
          getProjectByPath(folderPath).then((project) => {
            if (project) {
              updateProjectAccessTime(project.id).then(() => resolve(project.id)).catch(reject);
            } else {
              reject(new Error("Failed to add or find project."));
            }
          }).catch(reject);
        }
      }
    });
  });
};
const getProjectByPath = (folderPath) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error("Database not initialized."));
    }
    const sql = `SELECT * FROM projects WHERE folderPath = ?`;
    db.get(sql, [folderPath], (err, row) => {
      if (err) {
        console.error("Error fetching project by path:", err.message);
        reject(err);
      } else {
        resolve(row || null);
      }
    });
  });
};
const updateProjectAccessTime = (id) => {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error("Database not initialized."));
    }
    const sql = `UPDATE projects SET lastAccessed = ? WHERE id = ?`;
    db.run(sql, [(/* @__PURE__ */ new Date()).toISOString(), id], (err) => {
      if (err) {
        console.error("Error updating project access time:", err.message);
        reject(err);
      } else {
        console.log(`Updated access time for project ID: ${id}`);
        resolve();
      }
    });
  });
};
const getAllProjects = () => {
  return new Promise((resolve, reject) => {
    if (!db) {
      return reject(new Error("Database not initialized."));
    }
    const sql = `SELECT * FROM projects ORDER BY lastAccessed DESC`;
    db.all(sql, [], (err, rows) => {
      if (err) {
        console.error("Error fetching all projects:", err.message);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
};
const closeDatabase = () => {
  return new Promise((resolve, reject) => {
    if (!db) {
      return resolve();
    }
    db.close((err) => {
      if (err) {
        console.error("Error closing database:", err.message);
        reject(err);
      } else {
        console.log("Database connection closed.");
        db = null;
        resolve();
      }
    });
  });
};
electron.app.on("will-quit", async () => {
  await closeDatabase();
});
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
    // Removed fixed width and height to allow resizing/maximization
    webPreferences: {
      preload: path$1.join(__dirname, "preload.js"),
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
    mainWindow.loadFile(path$1.join(__dirname, `../renderer/index.html`));
  }
  return mainWindow;
};
electron.app.whenReady().then(async () => {
  try {
    await initDatabase();
    console.log("Database initialized successfully.");
  } catch (error) {
    console.error("Failed to initialize database:", error);
    electron.dialog.showErrorBox("Database Error", "Failed to initialize the project database. Project history will not be available.");
  }
  const mainWindow = createWindow();
  electron.ipcMain.handle("db:addProject", async (_, folderPath) => {
    try {
      const projectId = await addProject(folderPath);
      console.log(`Project added/updated in DB: ${folderPath} (ID: ${projectId})`);
      return projectId;
    } catch (error) {
      console.error("Error adding project via IPC:", error);
      return null;
    }
  });
  electron.ipcMain.handle("db:getAllProjects", async () => {
    try {
      const projects = await getAllProjects();
      return projects;
    } catch (error) {
      console.error("Error getting projects via IPC:", error);
      return [];
    }
  });
  electron.ipcMain.handle("dialog:openDirectory", async () => {
    const { canceled, filePaths } = await electron.dialog.showOpenDialog(mainWindow, {
      // Pass window reference
      properties: ["openDirectory"]
    });
    if (!canceled && filePaths.length > 0) {
      const selectedPath = filePaths[0];
      try {
        await addProject(selectedPath);
        console.log(`Added/updated project in DB from dialog: ${selectedPath}`);
      } catch (error) {
        console.error(`Failed to add project ${selectedPath} to database:`, error);
        electron.dialog.showErrorBox("Database Error", `Failed to save project ${path$1.basename(selectedPath)} to history.`);
      }
      return selectedPath;
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
        const fullPath = path$1.join(dirPath, entry.name);
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
  electron.ipcMain.handle("llm:fetchModels", async (_, configId) => {
    var _a, _b, _c, _d;
    console.log(`Fetching models for config ID: ${configId}`);
    const configs = store.get("llmConfigs", []);
    const selectedConfig = configs.find((c) => c.id === configId);
    if (!selectedConfig) {
      console.error(`Config ${configId} not found for fetching models.`);
      return null;
    }
    const apiKey = await keytar.getPassword(KEYTAR_SERVICE_NAME, selectedConfig.apiKeyId);
    if (!apiKey) {
      console.error(`API Key not found for config ${configId} when fetching models.`);
      return null;
    }
    const modelsUrl = new URL("/models", selectedConfig.apiEndpoint).toString();
    console.log(`Fetching models from: ${modelsUrl}`);
    try {
      const response = await axios.get(modelsUrl, {
        headers: {
          "Authorization": `Bearer ${apiKey}`
        }
      });
      if (response.data && Array.isArray(response.data.data)) {
        const modelIds = response.data.data.map((model) => model.id).filter((id) => typeof id === "string");
        console.log(`Found models: ${modelIds.join(", ")}`);
        return modelIds;
      } else {
        console.warn(`Unexpected response structure from ${modelsUrl}:`, response.data);
        return null;
      }
    } catch (error) {
      const errorMessage = ((_c = (_b = (_a = error.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) == null ? void 0 : _c.message) || error.message;
      console.error(`Error fetching models from ${modelsUrl}:`, errorMessage, (_d = error.response) == null ? void 0 : _d.data);
      return null;
    }
  });
  electron.ipcMain.on("llm:sendStreamRequest", async (event, payload) => {
    var _a, _b, _c, _d;
    const { context, query, configId, model } = payload;
    const senderWindow = electron.BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow) {
      console.error("Could not find sender window for LLM stream request.");
      return;
    }
    console.log(`Streaming prompt using config ${configId} and model ${model}...`);
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
        messages: [
          { role: "system", content: `Based on the following project context:

${context}

Answer the user's query.` },
          { role: "user", content: query }
        ],
        stream: true
        // Enable streaming
      }, {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Accept": "text/event-stream"
          // Important for SSE
        },
        responseType: "stream"
        // Tell axios to handle the response as a stream
      });
      response.data.on("data", (chunk) => {
        var _a2, _b2, _c2;
        const chunkStr = chunk.toString("utf-8");
        const lines = chunkStr.split("\n").filter((line) => line.trim().startsWith("data: "));
        for (const line of lines) {
          const jsonData = line.substring("data: ".length).trim();
          if (jsonData === "[DONE]") {
            console.log("Stream finished [DONE]");
            if (!senderWindow.isDestroyed()) {
              senderWindow.webContents.send("llm:streamEnd");
            }
            return;
          }
          try {
            const parsed = JSON.parse(jsonData);
            const content = (_c2 = (_b2 = (_a2 = parsed.choices) == null ? void 0 : _a2[0]) == null ? void 0 : _b2.delta) == null ? void 0 : _c2.content;
            if (content) {
              if (!senderWindow.isDestroyed()) {
                senderWindow.webContents.send("llm:chunk", content);
              }
            }
          } catch (parseError) {
            console.error("Failed to parse stream chunk JSON:", jsonData, parseError);
          }
        }
      });
      response.data.on("end", () => {
        console.log("Axios stream ended.");
        if (!senderWindow.isDestroyed()) {
          senderWindow.webContents.send("llm:streamEnd");
        }
      });
      response.data.on("error", (streamError) => {
        console.error("Axios stream error:", streamError);
        if (!senderWindow.isDestroyed()) {
          senderWindow.webContents.send("llm:streamError", `Stream error: ${streamError.message}`);
        }
      });
    } catch (error) {
      const errorMessage = ((_c = (_b = (_a = error.response) == null ? void 0 : _a.data) == null ? void 0 : _b.error) == null ? void 0 : _c.message) || error.message;
      console.error(`API Request Error for ${selectedConfig.name} (${model}):`, errorMessage, (_d = error.response) == null ? void 0 : _d.data);
      if (!senderWindow.isDestroyed()) {
        senderWindow.webContents.send("llm:streamError", `API request failed: ${errorMessage}`);
      }
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
