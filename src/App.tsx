import { useState, useEffect } from 'react';
import ReactMarkdown, { Components } from 'react-markdown'; // Use Components type
// Removed incorrect CodeProps import
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'; // Or choose another theme
import './App.css'; // We'll add layout styles here
import { useTheme } from './contexts/ThemeContext'; // Import useTheme hook

import { DirectoryItem } from './types/electron'; // Import the DirectoryItem type
import FileTree from './components/FileTree'; // Import the FileTree component
import LLMConfigManager from './components/LLMConfigManager'; // Import the LLM Config Manager
import { LLMConfig } from './types/llmConfig'; // Import LLMConfig type
import ChatView from './components/ChatView'; // Import the new ChatView component
import ProjectSelectionView from './components/ProjectSelectionView'; // Import the ProjectSelectionView component

function App() {
  const { theme, toggleTheme } = useTheme(); // Use the theme context
  const [selectedPath, setSelectedPath] = useState<string | null>(null); // Path of the currently active project
  const [directoryTree, setDirectoryTree] = useState<DirectoryItem[] | null>(null); // State for the file tree structure
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]); // State for selected file paths
  const [compiledContext, setCompiledContext] = useState<string>(''); // State for the final context string
  const [isLoading, setIsLoading] = useState<boolean>(false); // Loading state for directory analysis
  const [isCompiling, setIsCompiling] = useState<boolean>(false); // Loading state for context compilation
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>(''); // State for user query
  const [thinkingSteps, setThinkingSteps] = useState<string>(''); // State for <think> content
  const [llmResponse, setLlmResponse] = useState<string>(''); // State for final LLM response (excluding <think>)
  const [isSending, setIsSending] = useState<boolean>(false); // State for LLM request loading
  // State for LLM Configurations
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false); // Re-add state for modal visibility

  // --- New states for refactoring ---
  const [viewMode, setViewMode] = useState<'contextSelection' | 'chatting'>('contextSelection');
  const [pendingAddedFilePaths, setPendingAddedFilePaths] = useState<string[]>([]);
  const [addedContext, setAddedContext] = useState<string>('');
  const [chatHistoryContext, setChatHistoryContext] = useState<string>('');
  // --- End new states ---


  // Listener for analysis errors & fetch initial LLM configs & setup stream listeners
  useEffect(() => {
    // Fetch LLM configurations on mount
    const fetchInitialConfigs = async () => {
        try {
            console.log("Fetching LLM configs...");
            const configs = await window.electronAPI.getLLMConfigs();
            setLlmConfigs(configs);
            console.log("LLM configs fetched:", configs);
            // Optionally set a default selection
            if (configs.length > 0 && !selectedConfigId) {
                setSelectedConfigId(configs[0].id);
                if (configs[0].defaultModel) {
                    setSelectedModel(configs[0].defaultModel);
                } else if (configs[0].models.length > 0) {
                    setSelectedModel(configs[0].models[0]);
                }
            }
        } catch (err) {
            console.error("Error fetching initial LLM configs:", err);
            setError("Failed to load LLM configurations.");
        }
    };
    fetchInitialConfigs();

    // Setup analysis error listener
    const removeAnalysisErrorListener = window.electronAPI.onAnalysisError((errorMsg) => {
      console.error('Received analysis error from main:', errorMsg);
      setError(`Analysis Error: ${errorMsg}`);
      setIsLoading(false); // Ensure loading state is reset
    });

    // Setup LLM stream listeners
    const removeChunkListener = window.electronAPI.onLLMChunk((chunk) => {
        // Basic parsing for <think> tags
        const thinkRegex = /<think>(.*?)<\/think>/gs; // 's' flag for multiline
        let lastIndex = 0;
        let responseChunk = '';
        let thinkChunk = '';
        let match;

        while ((match = thinkRegex.exec(chunk)) !== null) {
            // Append text before the <think> tag to responseChunk
            responseChunk += chunk.substring(lastIndex, match.index);
            // Append content inside <think> tag to thinkChunk
            thinkChunk += match[1]; // Group 1 captures content inside tags
            lastIndex = thinkRegex.lastIndex;
        }
        // Append any remaining text after the last </think> tag
        responseChunk += chunk.substring(lastIndex);

        // Update states
        if (thinkChunk) {
            setThinkingSteps(prev => prev + thinkChunk);
        }
        if (responseChunk) {
            setLlmResponse(prev => prev + responseChunk);
        }
    });

    const removeStreamEndListener = window.electronAPI.onLLMStreamEnd(() => {
        console.log("Stream ended in renderer.");
        setIsSending(false); // Reset sending state when stream finishes
    });

     const removeStreamErrorListener = window.electronAPI.onLLMStreamError((errorMsg) => {
        console.error("Received stream error from main:", errorMsg);
        setError(`LLM Stream Error: ${errorMsg}`);
        setIsSending(false); // Reset sending state on error
    });

    // Cleanup function to remove all listeners
    return () => {
        removeAnalysisErrorListener();
        removeChunkListener();
        removeStreamEndListener();
        removeStreamErrorListener();
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // Effect to compile context when selected files change
  useEffect(() => {
    const compileContext = async () => {
      if (selectedFilePaths.length === 0) {
        setCompiledContext('');
        return; // No files selected, clear context
      }

      setIsCompiling(true);
      setError(null); // Clear previous errors
      console.log('Compiling context for:', selectedFilePaths);

      try {
        const fileContentsPromises = selectedFilePaths.map(filePath =>
          window.electronAPI.readFileContent(filePath)
        );
        const results = await Promise.all(fileContentsPromises);

        let combinedContext = '';
        results.forEach((content, index) => {
          const filePath = selectedFilePaths[index];
          if (content !== null) {
            // Add a header indicating the file path
            combinedContext += `--- File: ${filePath} ---\n\n`;
            combinedContext += content;
            combinedContext += '\n\n'; // Add spacing between files
          } else {
            // Optionally notify user about failed file reads
            console.warn(`Failed to read content for: ${filePath}`);
            combinedContext += `--- Failed to read file: ${filePath} ---\n\n`;
          }
        });

        setCompiledContext(combinedContext.trim()); // Set the compiled context, remove trailing newline
        console.log('Context compilation complete.');
      } catch (err) {
        console.error("Error during context compilation:", err);
        setError(err instanceof Error ? `Context Compilation Error: ${err.message}` : 'Unknown error during context compilation');
        setCompiledContext(''); // Clear context on error
      } finally {
        setIsCompiling(false);
      }
    };

    compileContext();
  }, [selectedFilePaths]); // Re-run whenever selectedFilePaths changes

  // Effect to process files added dynamically during chat
  useEffect(() => {
    const processPendingFiles = async () => {
      if (pendingAddedFilePaths.length === 0) {
        return; // Nothing to process
      }

      console.log('Processing pending added files:', pendingAddedFilePaths);
      // Create a copy and clear the state immediately to prevent race conditions
      const pathsToProcess = [...pendingAddedFilePaths];
      setPendingAddedFilePaths([]);

      try {
        const fileContentsPromises = pathsToProcess.map(filePath =>
          window.electronAPI.readFileContent(filePath)
        );
        const results = await Promise.all(fileContentsPromises);

        let newlyAddedContext = '';
        results.forEach((content, index) => {
          const filePath = pathsToProcess[index];
          if (content !== null) {
            newlyAddedContext += `--- Added File: ${filePath} ---\n\n`;
            newlyAddedContext += content;
            newlyAddedContext += '\n\n';
          } else {
            console.warn(`Failed to read content for added file: ${filePath}`);
            newlyAddedContext += `--- Failed to read added file: ${filePath} ---\n\n`;
          }
        });

        // Append the newly fetched context to the existing addedContext
        setAddedContext(prev => prev + newlyAddedContext);
        console.log('Finished processing added files.');

      } catch (err) {
        console.error("Error processing pending added files:", err);
        setError(err instanceof Error ? `Error adding file context: ${err.message}` : 'Unknown error adding file context');
        // Decide if we should retry or just notify user. For now, just log and set error.
      }
    };

    processPendingFiles();
  }, [pendingAddedFilePaths]); // Run whenever pendingAddedFilePaths changes

  // Function to analyze a directory once its path is known
  const analyzeDirectory = async (path: string) => {
    setIsLoading(true);
    setError(null);
    setDirectoryTree(null);
    setSelectedFilePaths([]);
    setCompiledContext('');
    setLlmResponse('');
    setQuery('');
    setViewMode('contextSelection');
    setAddedContext('');
    setChatHistoryContext('');
    setPendingAddedFilePaths([]);

    try {
      setSelectedPath(path); // Set the active project path
      console.log(`Requesting analysis for: ${path}`);
      const contextResult = await window.electronAPI.analyzeDirectory(path);
      console.log('Analysis result received.');
      if (typeof contextResult === 'string') {
        setError(contextResult);
        setDirectoryTree(null);
      } else {
        setDirectoryTree(contextResult);
        setCompiledContext(''); // Reset compiled context until files are selected
      }
    } catch (err) {
      console.error(`Error during analysis for path ${path}:`, err);
      setError(err instanceof Error ? `Analysis Error: ${err.message}` : String(err));
      setSelectedPath(null); // Reset path if analysis fails
    } finally {
      setIsLoading(false);
    }
  };

  // Function to handle opening a new directory via dialog
  const handleOpenNewProject = async () => {
    setIsLoading(true); // Set loading while dialog is open and potentially analyzing
    setError(null);
    try {
      console.log('Requesting directory selection...');
      const path = await window.electronAPI.openDirectoryDialog(); // This now also adds to DB
      console.log('Directory selected:', path);
      if (path) {
        await analyzeDirectory(path); // Analyze the newly selected path
      } else {
        console.log('Directory selection cancelled.');
        setIsLoading(false); // Reset loading if cancelled
      }
    } catch (err) {
      console.error("Error opening new project directory:", err);
      setError(err instanceof Error ? `Error opening directory: ${err.message}` : String(err));
      setIsLoading(false); // Reset loading on error
    }
    // Note: setIsLoading(false) is handled within analyzeDirectory on success/error
  };

  // Function to handle selecting a recent project
  const handleRecentProjectSelect = (path: string) => {
    console.log(`Selected recent project: ${path}`);
    analyzeDirectory(path); // Analyze the selected recent path
  };

  const handleSendPrompt = async () => {
    if (!query) {
      setError("Query cannot be empty.");
      return;
    }
    if (!selectedConfigId || !selectedModel) {
      setError("Configuration or model not selected.");
      return;
    }

    let contextToSend = '';
    let nextChatHistoryContext = '';

    if (viewMode === 'contextSelection') {
      if (!compiledContext) {
        setError("Please select files to compile context first.");
        return;
      }
      contextToSend = compiledContext;
      nextChatHistoryContext = compiledContext; // Initialize chat history
      console.log("Sending initial prompt (contextSelection mode)...");
    } else { // chatting mode
      // Combine previous history with any newly added context
      contextToSend = chatHistoryContext + (addedContext ? '\n\n' + addedContext : '');
      nextChatHistoryContext = contextToSend; // Update history with what's being sent
      console.log("Sending follow-up prompt (chatting mode)...");
    }

    setIsSending(true);
    setError(null);
    setLlmResponse('');
    setThinkingSteps('');

    console.log(`Requesting stream using config ${selectedConfigId} and model ${selectedModel}...`);
    try {
      // Initiate the stream request
      window.electronAPI.sendPromptStreamRequest({
        context: contextToSend,
        query: query,
        configId: selectedConfigId,
        model: selectedModel,
      });

      // --- State updates after successfully initiating the request ---
      setChatHistoryContext(nextChatHistoryContext); // Update history
      setAddedContext(''); // Clear added context as it's now part of history
      setQuery(''); // Clear the query input

      // Switch to chat mode after the first successful send
      if (viewMode === 'contextSelection') {
        setViewMode('chatting');
        console.log("Switched to chatting mode.");
      }
      // Note: isSending will be reset by stream end/error listeners

    } catch (err) {
      // This catch block might not be effective for errors *during* the stream,
      // as sendPromptStreamRequest is likely fire-and-forget.
      // Errors during the stream are handled by the onLLMStreamError listener.
      console.error("Error initiating prompt stream request:", err);
      setError(err instanceof Error ? `Error sending prompt: ${err.message}` : 'Unknown error sending prompt');
      setIsSending(false); // Ensure sending state is reset on initiation error
    }
  };

  // Handler for file selection changes from FileTree
  const handleFileSelectionChange = (filePath: string, isSelected: boolean) => {
    if (viewMode === 'contextSelection') {
      // Update initial selection list, triggering compiledContext useEffect
      setSelectedFilePaths(prevSelected => {
        if (isSelected) {
          return prevSelected.includes(filePath) ? prevSelected : [...prevSelected, filePath];
        } else {
          return prevSelected.filter(path => path !== filePath);
        }
      });
      console.log('Context Selection: Updated selectedFilePaths');
    } else if (viewMode === 'chatting') {
      // Handle dynamic additions during chat
      if (isSelected) {
        // Add to pending list for processing by useEffect
        setPendingAddedFilePaths(prevPending =>
          prevPending.includes(filePath) ? prevPending : [...prevPending, filePath]
        );
        console.log('Chatting: Added to pendingAddedFilePaths:', filePath);
      } else {
        // Currently ignoring deselection during chat for simplicity
        // Optional: Remove from pendingAddedFilePaths if it hasn't been processed yet
        // setPendingAddedFilePaths(prevPending => prevPending.filter(path => path !== filePath));
        console.log('Chatting: Deselection ignored for:', filePath);
      }
    }
  };

  // Render Project Selection View if no path is selected
  if (!selectedPath) {
    return (
      <ProjectSelectionView
        onProjectSelect={handleRecentProjectSelect}
        onOpenNewProject={handleOpenNewProject}
        isLoading={isLoading}
      />
    );
  }

  // Render main application view if a path is selected
  return (
    <div className={`app-container ${viewMode === 'chatting' ? 'chat-mode' : 'context-mode'}`}>

      {/* --- Left Pane (Project View) --- */}
      <aside className="left-pane">
        <button onClick={() => setSelectedPath(null)} style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
             Home
        </button>
        {selectedPath && (
          <p style={{ 
            wordBreak: 'break-word', 
            overflowWrap: 'break-word',
            maxWidth: '100%'
          }}>
            Project: {selectedPath}
          </p>
        )}
        <h3>Project Files</h3>

        {isLoading && <p>Loading project...</p>}
        {error && !isLoading && <p className="error-display">Error loading project: {error}</p>}

        {/* File Tree Display */}
        {!isLoading && directoryTree && (
          <FileTree
            treeData={directoryTree}
            selectedFiles={selectedFilePaths}
            onFileSelectionChange={handleFileSelectionChange}
          />
        )}
      </aside>

      {/* --- Conditional Rendering for Center/Right Panes (Context/Chat) --- */}
      {viewMode === 'contextSelection' ? (
        <>
          {/* --- Center Pane (Context Selection Mode) --- */}
          <section className="center-pane">
            <div className="context-pane">
              <h4>Compile Context</h4>
              {isCompiling && <p>Compiling context...</p>}
              <pre className="context-display-area">
                <code>{compiledContext || 'Select files from the tree to compile context.'}</code>
              </pre>
              {compiledContext && !isCompiling && (
                <button onClick={() => navigator.clipboard.writeText(compiledContext)} className="copy-button">
                  Copy Context
                </button>
              )}
            </div>
            <div className="query-pane">
              <h4>Your Query</h4>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Enter your query here to start the chat..."
                rows={5}
                disabled={isSending || isCompiling || !compiledContext}
              />
            </div>
          </section>

          {/* --- Right Pane (Context Selection Mode) --- */}
          <aside className="right-pane">
          <button onClick={toggleTheme} style={{ marginBottom: '1rem' }}>
          Toggle Theme ({theme === 'light' ? 'Dark' : 'Light'})
        </button>
            <h3>LLM Interaction</h3>
            <button onClick={() => setIsSettingsModalOpen(true)} style={{ marginBottom: '1rem', float: 'right', padding: '0.2rem 0.5rem' }}>
              Manage Configs
            </button>
            {/* Configuration Selection */}
            <div>
              <label htmlFor="config-select">Configuration: </label>
              <select
                id="config-select"
                value={selectedConfigId ?? ''}
                onChange={(e) => {
                  const newConfigId = e.target.value;
                  setSelectedConfigId(newConfigId);
                  const newConfig = llmConfigs.find(c => c.id === newConfigId);
                  if (newConfig) {
                    setSelectedModel(newConfig.defaultModel ?? (newConfig.models.length > 0 ? newConfig.models[0] : null));
                  } else {
                    setSelectedModel(null);
                  }
                }}
                disabled={llmConfigs.length === 0}
              >
                <option value="" disabled>-- Select Configuration --</option>
                {llmConfigs.map(config => (
                  <option key={config.id} value={config.id}>{config.name}</option>
                ))}
              </select>
            </div>
            {/* Model Selection */}
            <div style={{ marginTop: '0.5rem' }}>
              <label htmlFor="model-select">Model: </label>
              <select
                id="model-select"
                value={selectedModel ?? ''}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={!selectedConfigId}
              >
                <option value="" disabled>-- Select Model --</option>
                {llmConfigs.find(c => c.id === selectedConfigId)?.models.map(modelName => (
                  <option key={modelName} value={modelName}>{modelName}</option>
                ))}
              </select>
            </div>
            {/* Action Button: Start Chat */}
            <button
              onClick={handleSendPrompt}
              disabled={isSending || isLoading || isCompiling || !compiledContext || !query || !selectedConfigId || !selectedModel}
              style={{ marginTop: '10px', width: '100%' }}
            >
              {isSending ? 'Starting...' : 'Start Chat'}
            </button>
            {/* Response area is minimal/empty in this mode */}
            <div className="response-pane" style={{ marginTop: '1rem' }}>
               {error && <p className="error-display">Error: {error}</p>}
            </div>
          </aside>
        </>
      ) : (
        // --- Chatting Mode ---
        <ChatView
          query={query}
          setQuery={setQuery}
          llmResponse={llmResponse}
          thinkingSteps={thinkingSteps}
          isSending={isSending}
          error={error}
          handleSendPrompt={handleSendPrompt}
          llmConfigs={llmConfigs}
          selectedConfigId={selectedConfigId}
          setSelectedConfigId={setSelectedConfigId}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          // Pass chat history related props later if needed
        />
      )}

      {/* Settings Modal (Common to both modes) */}
      {isSettingsModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsSettingsModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-button" onClick={() => setIsSettingsModalOpen(false)}>X</button>
            <h2>LLM Configuration Management</h2>
            <LLMConfigManager />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
