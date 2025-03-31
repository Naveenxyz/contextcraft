import { useState, useEffect, useCallback, useRef } from 'react'; // Added useCallback, useRef
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
import ChatView from './components/ChatView'; // Import ChatView component
import { ChatMessage } from './types/chat'; // <<< Import ChatMessage type from shared definition
import ProjectSelectionView from './components/ProjectSelectionView'; // Import the ProjectSelectionView component

// Helper function to count files recursively
const countTotalFiles = (nodes: DirectoryItem[] | null): number => {
  if (!nodes) return 0;
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'file') {
      count++;
    } else if (node.type === 'directory' && node.children) {
      count += countTotalFiles(node.children);
    }
  }
  return count;
};


function App() {
  const { theme, toggleTheme } = useTheme(); // Use the theme context
  const [selectedPath, setSelectedPath] = useState<string | null>(null); // Path of the currently active project
  const [directoryTree, setDirectoryTree] = useState<DirectoryItem[] | null>(null); // State for the file tree structure
  const [totalFileCount, setTotalFileCount] = useState<number>(0); // <<< New state for total file count
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]); // State for selected file paths
  const [compiledContext, setCompiledContext] = useState<string>(''); // State for the final context string
  const [isLoading, setIsLoading] = useState<boolean>(false); // Loading state for directory analysis
  const [isCompiling, setIsCompiling] = useState<boolean>(false); // Loading state for context compilation
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>(''); // State for user query
  const [thinkingSteps, setThinkingSteps] = useState<string>(''); // State for <think> content
  // const [llmResponse, setLlmResponse] = useState<string>(''); // Replaced by chatHistory and currentAssistantMessage
  const [isSending, setIsSending] = useState<boolean>(false); // Represents the overall request state (user sending -> assistant responding)
  // State for LLM Configurations
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false); // Re-add state for modal visibility

  // const [fullPromptForCopy, setFullPromptForCopy] = useState<string>(''); // Replaced by chatHistory
  // const [copyPreviewText, setCopyPreviewText] = useState<string>(''); // No longer needed
  // --- States for Chat Refactor ---
  const [viewMode, setViewMode] = useState<'contextSelection' | 'chatting'>('contextSelection');
  const [pendingAddedFilePaths, setPendingAddedFilePaths] = useState<string[]>([]); // Keep for potential future use
  // const [addedContext, setAddedContext] = useState<string>(''); // Merged into chat history logic
  // const [chatHistoryContext, setChatHistoryContext] = useState<string>(''); // Replaced by chatHistory state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]); // Holds the actual conversation messages
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState<string | null>(null); // Holds the streaming response
  const currentAssistantMessageRef = useRef<string | null>(null); // Ref to track the latest streaming message
  const [isReceiving, setIsReceiving] = useState<boolean>(false); // True when assistant is actively streaming


  // Effect to keep the ref updated with the latest streaming message
  useEffect(() => {
    currentAssistantMessageRef.current = currentAssistantMessage;
  }, [currentAssistantMessage]);
  
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
        // Re-introduce parsing for <think> tags
        const thinkRegex = /<think>(.*?)<\/think>/gs; // 's' flag for multiline
        let lastIndex = 0;
        let currentResponseContent = ''; // Accumulator for non-think content in this chunk
        let currentThinkContent = ''; // Accumulator for think content in this chunk
        let match;

        // Ensure isReceiving is true when we get the first chunk
        if (!isReceiving) {
            setIsReceiving(true);
        }

        // Process the chunk to separate think content and response content
        thinkRegex.lastIndex = 0; // Reset regex state for each chunk
        while ((match = thinkRegex.exec(chunk)) !== null) {
            // Add content *before* the <think> tag to response content
            currentResponseContent += chunk.substring(lastIndex, match.index);
            // Add content *inside* the <think> tag to think content
            currentThinkContent += match[1];
            // Update lastIndex to point *after* the </think> tag
            lastIndex = match.index + match[0].length; // Use match[0].length to skip the entire tag block
        }
        // Add any remaining content *after* the last </think> tag
        currentResponseContent += chunk.substring(lastIndex);

        // Update states based on accumulated content for this chunk
        if (currentThinkContent) {
            setThinkingSteps(prev => prev + currentThinkContent);
        }
        if (currentResponseContent) {
            // Append only the response part to the current assistant message stream
            setCurrentAssistantMessage(prev => (prev || '') + currentResponseContent);
        }
    });

    const removeStreamEndListener = window.electronAPI.onLLMStreamEnd(() => {
        console.log("Stream ended in renderer.");
        // Add the complete assistant message (excluding thinking steps) to history
        setChatHistory(prev => {
            // Use the ref here to get the most up-to-date message content when the stream ends
            const messageFromRef = currentAssistantMessageRef.current;
            if (messageFromRef && messageFromRef.trim()) {
                // **Crucially, remove think tags from the final accumulated message here**
                const thinkRegex = /<think>.*?<\/think>/gs; // Use the same regex
                const finalContent = messageFromRef.replace(thinkRegex, '').trim();

                // Only add if there's actual content left after removing tags
                if (finalContent) {
                    const finalMessage: ChatMessage = {
                        id: `assistant-${Date.now()}`,
                        role: 'assistant',
                        content: finalContent,
                    };
                    return [...prev, finalMessage];
                }
            }
            return prev; // Return previous state if message is null/empty or only contained tags
        });
        setCurrentAssistantMessage(null); // Clear the streaming message buffer
        // Don't clear thinkingSteps here, let the next request handle it
        setIsReceiving(false);
        setIsSending(false); // Reset overall sending state
    });

     const removeStreamErrorListener = window.electronAPI.onLLMStreamError((errorMsg) => {
        console.error("Received stream error from main:", errorMsg);
        setError(`LLM Stream Error: ${errorMsg}`);
        setCurrentAssistantMessage(null); // Clear any partial message
        setIsReceiving(false);
        setIsSending(false); // Reset overall sending state on error
    });

    // Cleanup function to remove all listeners
    return () => {
        removeAnalysisErrorListener();
        removeChunkListener();
        removeStreamEndListener();
        removeStreamErrorListener();
    };
  }, []); // Empty dependency array: Run only on mount and unmount

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

  // Removed useEffect for copyPreviewText as it's no longer needed

// Removed useEffect that processed pendingAddedFilePaths asynchronously

  // Effect to calculate total file count
  useEffect(() => {
    console.log("Directory tree changed, recalculating total file count...");
    const count = countTotalFiles(directoryTree);
    setTotalFileCount(count);
    console.log("Total file count:", count);
  }, [directoryTree]); // Re-run whenever directoryTree changes

  // Function to analyze a directory once its path is known
  const analyzeDirectory = useCallback(async (path: string) => {
    setIsLoading(true);
    setError(null);
    setDirectoryTree(null);
    setSelectedFilePaths([]);
    setCompiledContext('');
    // setLlmResponse(''); // Removed
    setQuery('');
    setViewMode('contextSelection');
    // setAddedContext(''); // Removed
    // setChatHistoryContext(''); // Removed
    setChatHistory([]); // Reset chat history
    setCurrentAssistantMessage(null); // Reset streaming message
    setIsReceiving(false);
    setPendingAddedFilePaths([]);
    setTotalFileCount(0); // Reset count during analysis

    try {
      setSelectedPath(path); // Set the active project path
      console.log(`Requesting analysis for: ${path}`);
      const contextResult = await window.electronAPI.analyzeDirectory(path);
      console.log('Analysis result received.');
      if (typeof contextResult === 'string') {
        setError(contextResult);
        setDirectoryTree(null);
      } else {
        setDirectoryTree(contextResult); // This will trigger the useEffect for counting
        setCompiledContext(''); // Reset compiled context until files are selected
      }
    } catch (err) {
      console.error(`Error during analysis for path ${path}:`, err);
      setError(err instanceof Error ? `Analysis Error: ${err.message}` : String(err));
      setSelectedPath(null); // Reset path if analysis fails
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Function to handle opening a new directory via dialog
  const handleOpenNewProject = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      console.log('Requesting directory selection...');
      const path = await window.electronAPI.openDirectoryDialog();
      console.log('Directory selected:', path);
      if (path) {
        await analyzeDirectory(path);
      } else {
        console.log('Directory selection cancelled.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Error opening new project directory:", err);
      setError(err instanceof Error ? `Error opening directory: ${err.message}` : String(err));
      setIsLoading(false);
    }
  }, [analyzeDirectory]);

  // Function to handle selecting a recent project
  const handleRecentProjectSelect = useCallback((path: string) => {
    console.log(`Selected recent project: ${path}`);
    analyzeDirectory(path);
  }, [analyzeDirectory]);

  // Function to INITIATE the chat (called by "Start Chat" button)
  const handleStartChat = async () => {
    if (!query) {
      setError("Initial query cannot be empty.");
      return;
    }
    if (!selectedConfigId || !selectedModel) {
      setError("Configuration or model not selected.");
      return;
    }
    if (!compiledContext) {
      setError("Please select files and compile context first.");
      return;
    }

    console.log("Starting chat...");

    const initialSystemMessage: ChatMessage = {
      id: 'system-init',
      role: 'system',
      content: compiledContext,
    };
    const initialUserMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: query,
    };

    const initialHistory = [initialSystemMessage, initialUserMessage];

    setIsSending(true);
    setError(null);
    // setLlmResponse(''); // Removed
    setThinkingSteps(''); // Clear previous thinking steps if any
    setCurrentAssistantMessage(null); // Clear any previous streaming message
    setIsReceiving(false);

    console.log(`Requesting initial stream using config ${selectedConfigId} and model ${selectedModel}...`);
    try {
      // --- BACKEND API ADAPTATION NEEDED ---
      // Ideally, the backend accepts `messages: initialHistory`.
      // For now, send using the old format for the *first* message.
      await window.electronAPI.sendPromptStreamRequest({
        context: compiledContext, // Send initial context
        query: query,             // Send initial query
        configId: selectedConfigId,
        model: selectedModel,
        // messages: initialHistory // This is the target format
      });

      // Set history *after* successful API call initiation
      setChatHistory(initialHistory);
      setQuery(''); // Clear input query
      setViewMode('chatting'); // Switch view
      console.log("Switched to chatting mode.");

    } catch (err) {
      console.error("Error initiating prompt stream request:", err);
      setError(err instanceof Error ? `Error sending prompt: ${err.message}` : 'Unknown error sending prompt');
      setIsSending(false); // Reset sending state on error
    }
  };

  // Function to handle subsequent messages (passed to ChatView)
  const handleSendMessage = async (originalMessages: ChatMessage[]) => { // Rename input param
    if (!selectedConfigId || !selectedModel) {
      setError("Configuration or model not selected.");
      setChatHistory(prev => [...prev, { id: `error-${Date.now()}`, role: 'system', content: "Error: Configuration or model not selected." }]);
      return;
    }

    let messagesToSend = [...originalMessages]; // Create a mutable copy
    const lastMessageIndex = messagesToSend.length - 1;
    const lastMessage = messagesToSend[lastMessageIndex];

    if (!lastMessage || lastMessage.role !== 'user') {
        console.error("handleSendMessage called without a final user message.");
        return; // Should not happen if called correctly from ChatView
    }

    // --- Process Pending Files ---
    let addedFileContextString = '';
    if (pendingAddedFilePaths.length > 0) {
        console.log('Processing pending files before sending:', pendingAddedFilePaths);
        const pathsToProcess = [...pendingAddedFilePaths]; // Copy before clearing
        // Don't clear pending paths immediately, do it after successful processing

        try {
            const fileContentsPromises = pathsToProcess.map(filePath =>
                window.electronAPI.readFileContent(filePath)
            );
            const results = await Promise.all(fileContentsPromises);

            results.forEach((content, index) => {
                const filePath = pathsToProcess[index];
                if (content !== null) {
                    addedFileContextString += `--- Added File: ${filePath} ---\n\n${content}\n\n`;
                } else {
                    console.warn(`Failed to read content for added file: ${filePath}`);
                    addedFileContextString += `--- Failed to read added file: ${filePath} ---\n\n`;
                }
            });
            addedFileContextString = addedFileContextString.trim(); // Remove trailing newlines

            if (addedFileContextString) {
                // Prepend the context to the *last user message*
                const updatedLastMessage: ChatMessage = {
                    ...lastMessage,
                    content: `${addedFileContextString}\n\n---\n\n${lastMessage.content}` // Prepend context
                };
                // Replace the last message in our mutable copy
                messagesToSend[lastMessageIndex] = updatedLastMessage;
                console.log('Added file context prepended to user message.');
                // setSelectedFilePaths update is now handled by handleFileSelectionChange
                setPendingAddedFilePaths([]); // Clear pending paths now
            }

        } catch (err) {
            console.error("Error processing pending added files during send:", err);
            const fileReadErrorMsg = err instanceof Error ? `Error adding file context: ${err.message}` : 'Unknown error adding file context';
            setError(fileReadErrorMsg);
            // Add error to chat history *before* sending the original message
            setChatHistory(prev => [...prev, { id: `error-fileread-${Date.now()}`, role: 'system', content: fileReadErrorMsg }]);
            // Proceed without the added context, using originalMessages
            messagesToSend = [...originalMessages]; // Revert to original if file reading failed
            setPendingAddedFilePaths([]); // Also clear pending paths on error
        }
    }
    // --- End Process Pending Files ---
// Removed erroneous closing brace here

    console.log("Sending subsequent message...");

    setIsSending(true);
    setError(null);
    setThinkingSteps(''); // Clear thinking steps for new request
    setCurrentAssistantMessage(null);
    setIsReceiving(false);

    // Update the main history state immediately to show the user message
    setChatHistory(messagesToSend); // Use the potentially modified messages array

    console.log(`Requesting subsequent stream using config ${selectedConfigId} and model ${selectedModel}...`);
    try {
      // --- BACKEND API ADAPTATION NEEDED ---
      // The backend MUST be updated to accept the 'messages' array here.
      // Sending context/query is incorrect for follow-up turns.
      // Add checks here to ensure configId and model are not null
      if (!selectedConfigId || !selectedModel) {
          console.error("Config ID or Model became null unexpectedly before API call.");
          setError("Configuration or model missing.");
          setIsSending(false);
          return; // Stop execution
      }

      await window.electronAPI.sendPromptStreamRequest({
        // context: '', // Incorrect for follow-up
        // query: lastMessage.content, // Incorrect for follow-up
        configId: selectedConfigId, // Now guaranteed to be string
        model: selectedModel,       // Now guaranteed to be string
        messages: messagesToSend    // Pass the potentially modified messages array
      });

      // No need to set history again here, already done before API call
      // No need to clear query, ChatView handles it

    } catch (err) {
      console.error("Error initiating subsequent prompt stream request:", err);
      const errorMsg = err instanceof Error ? `Error sending message: ${err.message}` : 'Unknown error sending message';
      setError(errorMsg);
      // Add error to chat history
      setChatHistory(prev => [...prev, { id: `error-${Date.now()}`, role: 'system', content: `Error: ${errorMsg}` }]);
      setIsSending(false); // Reset sending state on error
    }
  };

  // Function to switch back to context selection view
  const handleGoBackToContextSelection = useCallback(() => {
    setViewMode('contextSelection');
    // Optionally reset other chat-specific states if needed
    // setError(null);
    // setQuery(''); // Keep query maybe?
  }, []);

  // Handler for individual file selection changes
  const handleFileSelectionChange = useCallback((filePath: string, isSelected: boolean) => {
    if (viewMode === 'contextSelection') {
      setSelectedFilePaths(prevSelected => {
        const currentSet = new Set(prevSelected);
        if (isSelected) {
          currentSet.add(filePath);
        } else {
          currentSet.delete(filePath);
        }
        return Array.from(currentSet);
      });
      console.log('Context Selection: Updated selectedFilePaths');
    } else if (viewMode === 'chatting') {
      if (isSelected) {
        // Add to pending list for next message processing
        setPendingAddedFilePaths(prevPending =>
          prevPending.includes(filePath) ? prevPending : [...prevPending, filePath]
        );
        // ALSO update the main selection state immediately for visual feedback
        setSelectedFilePaths(prevSelected => {
            const currentSet = new Set(prevSelected);
            currentSet.add(filePath);
            return Array.from(currentSet);
        });
        console.log('Chatting: Added to pending and selected paths:', filePath);
      } else {
        console.log('Chatting: Deselection ignored for:', filePath);
      }
    }
  }, [viewMode]);

  // <<< Handler for selecting all files in a folder >>>
  const handleFolderSelect = useCallback((folderPath: string, filePaths: string[]) => {
      console.log(`App: Selecting files for folder ${folderPath}`);
      // Add files to selection, ensuring no duplicates
      setSelectedFilePaths(prevSelected => {
          const combined = new Set([...prevSelected, ...filePaths]);
          return Array.from(combined);
      });
      // If in chat mode, maybe add to pending instead? For now, assume context mode.
      if (viewMode === 'chatting') {
          console.warn("Folder selection initiated in chat mode - adding directly to selection for now.");
          // Potentially add to pendingAddedFilePaths instead or handle differently
      }
  }, [viewMode]); // Dependency on viewMode might be needed if behavior changes

  // <<< Handler for deselecting all files in a folder >>>
  const handleFolderDeselect = useCallback((folderPath: string, filePaths: string[]) => {
      console.log(`App: Deselecting files for folder ${folderPath}`);
      // Remove files from selection
      setSelectedFilePaths(prevSelected => {
          const currentSet = new Set(prevSelected);
          filePaths.forEach(path => currentSet.delete(path));
          return Array.from(currentSet);
      });
       // If in chat mode, maybe ignore? For now, assume context mode.
       if (viewMode === 'chatting') {
          console.warn("Folder deselection initiated in chat mode - removing directly from selection for now.");
      }
  }, [viewMode]); // Dependency on viewMode might be needed if behavior changes


  // Unused handlers removed


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

        {isLoading && <p>Loading project...</p>}
        {error && !isLoading && <p className="error-display">Error loading project: {error}</p>}

        {/* File Tree Display */}
        {!isLoading && directoryTree && (
          <FileTree
            treeData={directoryTree}
            selectedFiles={selectedFilePaths}
            totalFileCount={totalFileCount}
            onFileSelectionChange={handleFileSelectionChange}
            onFolderSelect={handleFolderSelect} // <<< Pass handler
            onFolderDeselect={handleFolderDeselect} // <<< Pass handler
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
                <button
                  onClick={() => {
                    const textToCopy = query
                      ? `User Query:\n${query}\n\n---\n\nContext:\n${compiledContext}` // Query first
                      : compiledContext; // Context only if query is empty
                    navigator.clipboard.writeText(textToCopy);
                  }}
                  className="copy-button"
                  // Button is enabled as long as context exists
                >
                  {query ? 'Copy Query + Context' : 'Copy Context'} {/* Dynamic button text */}
                </button>
              )}
              {/* Preview Area */}
              {/* Removed Copy Preview Area */}
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
              onClick={handleStartChat} // Use the new handler to initiate chat
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
          // Input/Query state
          query={query}
          setQuery={setQuery}
          // LLM Configs
          llmConfigs={llmConfigs}
          selectedConfigId={selectedConfigId}
          setSelectedConfigId={setSelectedConfigId}
          selectedModel={selectedModel}
          setSelectedModel={setSelectedModel}
          // Chat History & State
          chatHistory={chatHistory}
          onSendMessage={handleSendMessage} // Pass the handler for sending messages
          initialContext={compiledContext} // Pass the initially compiled context
          // Streaming State
          currentAssistantMessage={currentAssistantMessage}
          isReceiving={isReceiving}
          // Overall Request State & Errors
          isSending={isSending} // Pass the overall sending state
          thinkingSteps={thinkingSteps} // Pass thinking steps (might be shown briefly before stream starts)
          error={error}
          // Add the go back handler
          onGoBack={handleGoBackToContextSelection}
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
