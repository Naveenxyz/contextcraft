import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import keytar from 'keytar'; // Import keytar
import axios from 'axios';
import fs from 'fs/promises';
import Store from 'electron-store'; // Revert back to default import
import { randomUUID } from 'node:crypto'; // For generating unique IDs
import { initDatabase, addProject, getAllProjects, closeDatabase } from './database'; // Import database functions

// Define the service name for keytar (used for API keys)
const KEYTAR_SERVICE_NAME = 'ContextCraftLLMKeys';

// Define the structure for LLM Config (duplicate or import from shared type)
interface LLMConfig {
  id: string;
  name: string;
  apiEndpoint: string;
  apiKeyId: string; // ID used in keytar
  models: string[];
  defaultModel?: string;
}

// Initialize electron-store for LLM configurations
// Removing schema to simplify type inference for now
// const schema = { ... }; // Schema removed

// Instantiate Store, handling potential .default wrapping
let storeInstance;
const StoreConstructor = (Store as any).default || Store;
try {
  storeInstance = new StoreConstructor();
} catch (e) {
  // Fallback if direct construction fails (less likely but possible)
  console.warn("Direct Store construction failed, attempting fallback:", e);
  storeInstance = Store; // Assign the module itself if construction fails
}
const store = storeInstance as Store<{ llmConfigs: LLMConfig[] }>;


// Define the service name for keytar
// const SERVICE_NAME = 'ContextCraft'; // Keep the old one for now? Or migrate? Let's use a new one for LLM keys.

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    // Removed fixed width and height to allow resizing/maximization
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Reverted back to .js
      contextIsolation: true, // Recommended for security
      nodeIntegration: false, // Recommended for security
    },
  });

  // Load the index.html of the app.
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Open the DevTools automatically in development
    mainWindow.webContents.openDevTools();
  } else {
    // Load the production build
    mainWindow.loadFile(path.join(__dirname, `../renderer/index.html`)); // Adjust path as needed based on build output
  }

  // Optional: Remove menu bar
  // mainWindow.setMenuBarVisibility(false);

  return mainWindow; // Return the window instance
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => { // Make async for await
  // Initialize the database first
  try {
    await initDatabase();
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    // Handle error appropriately - maybe show an error dialog and quit?
    // For now, we'll log and continue, but the app might not function correctly.
    dialog.showErrorBox('Database Error', 'Failed to initialize the project database. Project history will not be available.');
    // Consider app.quit() here if the DB is critical
  }

  const mainWindow = createWindow(); // Get the window instance

  // --- IPC Handlers ---

  // --- Project Management IPC Handlers ---

  // Handle adding a project (folder path)
  ipcMain.handle('db:addProject', async (_, folderPath: string) => {
    try {
      const projectId = await addProject(folderPath);
      console.log(`Project added/updated in DB: ${folderPath} (ID: ${projectId})`);
      return projectId; // Return the ID (new or existing)
    } catch (error) {
      console.error('Error adding project via IPC:', error);
      return null; // Indicate failure
    }
  });

  // Handle getting all projects
  ipcMain.handle('db:getAllProjects', async () => {
    try {
      const projects = await getAllProjects();
      return projects;
    } catch (error) {
      console.error('Error getting projects via IPC:', error);
      return []; // Return empty array on failure
    }
  });

  // --- End Project Management Handlers ---


  // Handle File/Directory Selection (Modified to add project to DB)
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { // Pass window reference
      properties: ['openDirectory']
    });
    if (!canceled && filePaths.length > 0) {
      const selectedPath = filePaths[0];
      try {
        // Add the selected path to the database
        await addProject(selectedPath);
        console.log(`Added/updated project in DB from dialog: ${selectedPath}`);
      } catch (error) {
        console.error(`Failed to add project ${selectedPath} to database:`, error);
        // Optionally notify the user, but still return the path for immediate use
        dialog.showErrorBox('Database Error', `Failed to save project ${path.basename(selectedPath)} to history.`);
      }
      return selectedPath; // Return the path regardless of DB success for immediate use
    }
    return undefined;
  });

  // Define the structure for directory items
  interface DirectoryItem {
    path: string;
    name: string;
    type: 'file' | 'directory';
    children?: DirectoryItem[];
  }

  // Handle Directory Analysis (Returns Structured Tree)
  async function analyzeDirectoryRecursive(dirPath: string, currentWindow: BrowserWindow): Promise<DirectoryItem[]> {
    let structure: DirectoryItem[] = [];
    // More comprehensive ignore list (add/remove based on common project types)
    const ignoreDirs = [
      'node_modules', '.git', '.vscode', 'dist', 'out', 'build', 'target', // Common build/tooling dirs
      '__pycache__', 'venv', '.venv', 'env', '.env', // Python virtual envs
      '.next', '.nuxt', // Framework build dirs
      'coverage', // Test coverage reports
      // Add more directories as needed
    ];
    const ignoreFiles = [
      '.DS_Store', 'Thumbs.db', // OS specific
      '.env', '.env.*', // Environment files (sensitive)
      '*.log', // Log files
      'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', // Lock files (often too large/noisy)
      // Add more file patterns (e.g., '*.pyc')
    ];
    // Basic regex/glob matching could be added here for ignoreFiles

    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        // Optional: Send progress update
        // currentWindow.webContents.send('analysis-progress', calculateProgress());

        for (const entry of entries) {
            // Skip ignored directories and files
            if (entry.isDirectory() && ignoreDirs.includes(entry.name)) continue;
            if (entry.isFile() && ignoreFiles.includes(entry.name)) continue; // Basic file name check, can be enhanced with glob/regex

            const fullPath = path.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                // Recursively analyze subdirectories
                const children = await analyzeDirectoryRecursive(fullPath, currentWindow);
                structure.push({
                    path: fullPath,
                    name: entry.name,
                    type: 'directory',
                    children: children, // Add children if it's a directory
                });
            } else {
                // Add files to the structure
                 structure.push({
                    path: fullPath,
                    name: entry.name,
                    type: 'file',
                 });
            }
        }
    } catch (error) {
        console.error(`Error reading directory ${dirPath}:`, error);
        // Send error back to renderer?
        currentWindow.webContents.send('analysis-error', `Error reading ${dirPath}`);
    }
    return structure;
  }

  ipcMain.handle('analysis:analyzeDirectory', async (event, dirPath: string): Promise<DirectoryItem[] | string> => { // Update return type
    const currentWindow = BrowserWindow.fromWebContents(event.sender);
    if (!currentWindow) {
        console.error("Could not find window for analysis request.");
        return "Error: Could not find window."; // Return error string
    }
    console.log(`Analyzing directory: ${dirPath}`);
    try {
        const analysisResult: DirectoryItem[] = await analyzeDirectoryRecursive(dirPath, currentWindow);
        console.log(`Analysis complete for: ${dirPath}`);
        return analysisResult; // Return the structured tree
    } catch (error) {
        console.error("Analysis failed:", error);
        return `Error during analysis: ${error instanceof Error ? error.message : String(error)}`; // Return error string
    }
  });

  // Handle Reading File Content
  ipcMain.handle('file:readFileContent', async (_, filePath: string): Promise<string | null> => {
    console.log(`Reading content for: ${filePath}`);
    try {
      // Basic security check: Ensure the path is within reasonable bounds if needed,
      // although relying on user selection via dialog is the primary safeguard here.
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error);
      // Return null or throw an error that the renderer can catch
      return null; // Indicate failure to read
    }
  });

  // --- LLM Configuration IPC Handlers ---

  ipcMain.handle('llm:getConfigs', async (): Promise<LLMConfig[]> => {
    // Use 'any' cast temporarily
    const configs = (store as any).get('llmConfigs', []) as LLMConfig[];
    return configs;
  });

  ipcMain.handle('llm:addConfig', async (_, configData: Omit<LLMConfig, 'id' | 'apiKeyId'>, apiKey: string): Promise<LLMConfig | null> => {
    try {
      const newId = randomUUID();
      const apiKeyId = newId; // Use the config ID as the keytar account ID for simplicity
      const newConfig: LLMConfig = {
        ...configData,
        id: newId,
        apiKeyId: apiKeyId,
      };

      // Store the API key securely
      await keytar.setPassword(KEYTAR_SERVICE_NAME, apiKeyId, apiKey);

      // Add the configuration to the store (using 'any' cast temporarily)
      const currentConfigs = (store as any).get('llmConfigs', []) as LLMConfig[]; // Cast applied
      currentConfigs.push(newConfig);
      (store as any).set('llmConfigs', currentConfigs); // Cast applied

      console.log(`Added LLM config: ${newConfig.name} (ID: ${newId})`);
      return newConfig; // Return the newly created config
    } catch (error) {
      console.error('Error adding LLM config:', error);
      return null; // Indicate failure
    }
  });

  ipcMain.handle('llm:updateConfig', async (_, config: LLMConfig, apiKey?: string): Promise<boolean> => {
    try {
      // Use 'any' cast temporarily
      const currentConfigs = (store as any).get('llmConfigs', []) as LLMConfig[]; // Cast applied
      // Explicitly type 'c' as LLMConfig
      const configIndex = currentConfigs.findIndex((c: LLMConfig) => c.id === config.id);

      if (configIndex === -1) {
        console.error(`Config with ID ${config.id} not found for update.`);
        return false; // Config not found
      }

      // Update API key if provided
      if (apiKey) {
        await keytar.setPassword(KEYTAR_SERVICE_NAME, config.apiKeyId, apiKey);
        console.log(`Updated API key for config ID: ${config.id}`);
      }

      // Update the config in the store (using 'any' cast temporarily)
      currentConfigs[configIndex] = config;
      (store as any).set('llmConfigs', currentConfigs); // Cast applied

      console.log(`Updated LLM config: ${config.name} (ID: ${config.id})`);
      return true;
    } catch (error) {
      console.error('Error updating LLM config:', error);
      return false; // Indicate failure
    }
  });

   ipcMain.handle('llm:deleteConfig', async (_, configId: string): Promise<boolean> => {
    try {
        // Use 'any' cast temporarily
        const currentConfigs = (store as any).get('llmConfigs', []) as LLMConfig[]; // Cast applied
        // Explicitly type 'c' as LLMConfig
        const configToDelete = currentConfigs.find((c: LLMConfig) => c.id === configId);

        if (!configToDelete) {
            console.error(`Config with ID ${configId} not found for deletion.`);
            return false; // Config not found
        }

        // Delete the API key from keytar
        await keytar.deletePassword(KEYTAR_SERVICE_NAME, configToDelete.apiKeyId);

        // Remove the config from the store (using 'any' cast temporarily)
        // Explicitly type 'c' as LLMConfig
        const updatedConfigs = currentConfigs.filter((c: LLMConfig) => c.id !== configId);
        (store as any).set('llmConfigs', updatedConfigs); // Cast applied

        console.log(`Deleted LLM config ID: ${configId}`);
        return true;
    } catch (error) {
        console.error('Error deleting LLM config:', error);
        return false; // Indicate failure
    }
   });

   // Handle Fetching Models for a Configuration
   ipcMain.handle('llm:fetchModels', async (_, configId: string): Promise<string[] | null> => {
       console.log(`Fetching models for config ID: ${configId}`);
       const configs = (store as any).get('llmConfigs', []) as LLMConfig[];
       const selectedConfig = configs.find(c => c.id === configId);

       if (!selectedConfig) {
           console.error(`Config ${configId} not found for fetching models.`);
           return null; // Or throw error
       }

       const apiKey = await keytar.getPassword(KEYTAR_SERVICE_NAME, selectedConfig.apiKeyId);
       if (!apiKey) {
           console.error(`API Key not found for config ${configId} when fetching models.`);
           return null; // Or throw error
       }

       // Construct the /models URL
       const modelsUrl = new URL('/models', selectedConfig.apiEndpoint).toString();
       console.log(`Fetching models from: ${modelsUrl}`);

       try {
           const response = await axios.get(modelsUrl, {
               headers: {
                   'Authorization': `Bearer ${apiKey}`,
               }
           });

           // Assuming the response structure is like OpenAI's: { data: [{ id: "model-name" }, ...] }
           if (response.data && Array.isArray(response.data.data)) {
               const modelIds = response.data.data.map((model: any) => model.id).filter((id: any) => typeof id === 'string');
               console.log(`Found models: ${modelIds.join(', ')}`);
               return modelIds;
           } else {
               console.warn(`Unexpected response structure from ${modelsUrl}:`, response.data);
               return null; // Indicate unexpected structure
           }
       } catch (error: any) {
           const errorMessage = error.response?.data?.error?.message || error.message;
           console.error(`Error fetching models from ${modelsUrl}:`, errorMessage, error.response?.data);
           return null; // Indicate failure
       }
   });
   // --- End LLM Configuration Handlers ---


  // Handle LLM Prompt Sending (Streaming)
  ipcMain.on('llm:sendStreamRequest', async (event, payload: { context: string; query: string; configId: string; model: string; }) => {
    const { context, query, configId, model } = payload;
    const senderWindow = BrowserWindow.fromWebContents(event.sender);

    if (!senderWindow) {
      console.error("Could not find sender window for LLM stream request.");
      return; // Cannot send response back
    }

    console.log(`Streaming prompt using config ${configId} and model ${model}...`);

    // Find the selected configuration
    const configs = (store as any).get('llmConfigs', []) as LLMConfig[];
    const selectedConfig = configs.find(c => c.id === configId);

    if (!selectedConfig) {
        console.error(`Configuration with ID ${configId} not found.`);
        throw new Error(`Configuration with ID ${configId} not found.`);
    }

    // Get the API key using the apiKeyId from the config
    const apiKey = await keytar.getPassword(KEYTAR_SERVICE_NAME, selectedConfig.apiKeyId);

    if (!apiKey) {
      console.error(`API Key for config ${configId} (key ID: ${selectedConfig.apiKeyId}) not found using service ${KEYTAR_SERVICE_NAME}.`);
      throw new Error(`API Key for configuration "${selectedConfig.name}" not found. Please check settings.`);
    }

    // Construct the API endpoint URL correctly
    // Ensure base endpoint doesn't have trailing slash and path starts with one
    const baseEndpoint = selectedConfig.apiEndpoint.endsWith('/')
      ? selectedConfig.apiEndpoint.slice(0, -1)
      : selectedConfig.apiEndpoint;
    const apiPath = '/chat/completions'; // Assuming this path for OpenAI compatibility
    const apiUrl = `${baseEndpoint}${apiPath}`;
    console.log(`Target API URL: ${apiUrl}`);

    try {
      const response = await axios.post(apiUrl, {
        model: model,
        messages: [
          { role: "system", content: `Based on the following project context:\n\n${context}\n\nAnswer the user's query.` },
          { role: "user", content: query }
        ],
        stream: true, // Enable streaming
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream', // Important for SSE
        },
        responseType: 'stream', // Tell axios to handle the response as a stream
      });

      // Handle the stream
      response.data.on('data', (chunk: Buffer) => {
        const chunkStr = chunk.toString('utf-8');
        // Parse SSE data: lines starting with "data: "
        const lines = chunkStr.split('\n').filter(line => line.trim().startsWith('data: '));
        for (const line of lines) {
            const jsonData = line.substring('data: '.length).trim();
            if (jsonData === '[DONE]') {
                // Stream finished signal from OpenAI spec
                console.log('Stream finished [DONE]');
                if (!senderWindow.isDestroyed()) {
                    senderWindow.webContents.send('llm:streamEnd');
                }
                return; // Stop processing this chunk
            }
            try {
                const parsed = JSON.parse(jsonData);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                    // Send the actual text content chunk back
                     if (!senderWindow.isDestroyed()) {
                        senderWindow.webContents.send('llm:chunk', content);
                    }
                }
            } catch (parseError) {
                console.error('Failed to parse stream chunk JSON:', jsonData, parseError);
                // Optionally send a specific error or ignore malformed chunks
            }
        }
      });

      response.data.on('end', () => {
        console.log('Axios stream ended.');
        // Ensure end signal is sent if not already sent by [DONE]
         if (!senderWindow.isDestroyed()) {
            senderWindow.webContents.send('llm:streamEnd');
        }
      });

      response.data.on('error', (streamError: Error) => {
        console.error('Axios stream error:', streamError);
         if (!senderWindow.isDestroyed()) {
            senderWindow.webContents.send('llm:streamError', `Stream error: ${streamError.message}`);
        }
      });

    } catch (error: any) {
      // Handle initial connection errors or non-2xx responses before stream starts
      const errorMessage = error.response?.data?.error?.message || error.message;
      console.error(`API Request Error for ${selectedConfig.name} (${model}):`, errorMessage, error.response?.data);
      // Send error back to renderer via the stream error channel
       if (!senderWindow.isDestroyed()) {
        senderWindow.webContents.send('llm:streamError', `API request failed: ${errorMessage}`);
      }
    }
  });


  // --- App Lifecycle Events ---

  app.on('activate', () => {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.