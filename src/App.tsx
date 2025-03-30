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

function App() {
  const { theme, toggleTheme } = useTheme(); // Use the theme context
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [directoryTree, setDirectoryTree] = useState<DirectoryItem[] | null>(null); // State for the file tree structure
  const [selectedFilePaths, setSelectedFilePaths] = useState<string[]>([]); // State for selected file paths
  const [compiledContext, setCompiledContext] = useState<string>(''); // State for the final context string
  const [isLoading, setIsLoading] = useState<boolean>(false); // Loading state for directory analysis
  const [isCompiling, setIsCompiling] = useState<boolean>(false); // Loading state for context compilation
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<string>(''); // State for user query
  const [llmResponse, setLlmResponse] = useState<string>(''); // State for LLM response
  const [isSending, setIsSending] = useState<boolean>(false); // State for LLM request loading
  // State for LLM Configurations
  const [llmConfigs, setLlmConfigs] = useState<LLMConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  // Removed apiKeyInput and apiKeyStatus states as they are handled by LLMConfigManager


  // Listener for analysis errors & fetch initial LLM configs
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

    const removeErrorListener = window.electronAPI.onAnalysisError((errorMsg) => {
      console.error('Received analysis error from main:', errorMsg);
      setError(`Analysis Error: ${errorMsg}`);
      setIsLoading(false); // Ensure loading state is reset
    });
    return () => removeErrorListener();
  }, []);

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

  const handleSelectAndAnalyzeDirectory = async () => {
    setIsLoading(true);
    setError(null);
    setDirectoryTree(null); // Reset tree
    setSelectedFilePaths([]); // Reset selected files
    setCompiledContext(''); // Reset compiled context
    setSelectedPath(null);
    setLlmResponse(''); // Clear previous response
    setQuery(''); // Clear previous query

    try {
      console.log('Requesting directory selection...');
      const path = await window.electronAPI.openDirectoryDialog();
      console.log('Directory selected:', path);

      if (path) {
        setSelectedPath(path);
        console.log(`Requesting analysis for: ${path}`);
        const contextResult = await window.electronAPI.analyzeDirectory(path);
        console.log('Analysis result received.');
        // Basic check if the result indicates an error from main process
        if (typeof contextResult === 'string') { // It's an error string
            setError(contextResult);
            setDirectoryTree(null);
        } else { // It's the DirectoryItem[] tree
            setDirectoryTree(contextResult);
            // Reset compiled context until files are selected
            setCompiledContext('');
        }
      } else {
        console.log('Directory selection cancelled.');
      }
    } catch (err) {
      console.error("Error during directory selection or analysis:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendPrompt = async () => {
      // Use compiledContext now
      if (!compiledContext || !query) {
          setError("Compiled context and query are required to send to LLM.");
          return;
      }
      setIsSending(true);
      setError(null);
      setLlmResponse('');

      try {
          console.log(`Sending prompt using config ${selectedConfigId} and model ${selectedModel}...`);
          if (!selectedConfigId || !selectedModel) {
              throw new Error("Configuration or model not selected.");
          }
          // Send configId and model instead of 'llm' string
          const response = await window.electronAPI.sendPrompt({
              context: compiledContext,
              query: query,
              configId: selectedConfigId, // Pass selected config ID
              model: selectedModel, // Pass selected model
          });
          console.log("LLM response received.");
          setLlmResponse(response);
      } catch (err) {
          console.error("Error sending prompt:", err);
          setError(err instanceof Error ? err.message : String(err));
      } finally {
          setIsSending(false);
      }
    };

  // Handler for file selection changes from FileTree
  const handleFileSelectionChange = (filePath: string, isSelected: boolean) => {
        setSelectedFilePaths(prevSelected => {
            if (isSelected) {
                // Add file path if it's not already included
                return prevSelected.includes(filePath) ? prevSelected : [...prevSelected, filePath];
            } else {
                // Remove file path
                return prevSelected.filter(path => path !== filePath);
            }
        });
        // TODO: Trigger context compilation when selection changes (or via a button)
        // For now, just log the change
        console.log('Selected files:', isSelected ? [...selectedFilePaths, filePath] : selectedFilePaths.filter(path => path !== filePath));
    };

  return (
    <div className="app-container">
      {/* --- Left Pane --- */}
        <aside className="left-pane">
          <h3>Settings / Files</h3>
           <button onClick={toggleTheme} style={{ marginBottom: '1rem' }}>
            Toggle Theme ({theme === 'light' ? 'Dark' : 'Light'})
          </button>
          <button onClick={handleSelectAndAnalyzeDirectory} disabled={isLoading}>
            {isLoading ? 'Analyzing...' : 'Select Directory'}
          </button>
        {selectedPath && <p>Path: {selectedPath}</p>}

        {/* LLM Configuration Manager */}
        <LLMConfigManager />

        {/* File Tree Display */}
        <FileTree
            treeData={directoryTree}
            selectedFiles={selectedFilePaths}
            onFileSelectionChange={handleFileSelectionChange}
        />
      </aside>

      {/* --- Center Pane --- */}
      <section className="center-pane">
        <div className="context-pane">
          {/* TODO: Render the directoryTree structure here instead */}
          <h4>Compiled Context</h4>
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
            placeholder="Enter your query here..."
            rows={5}
            disabled={isSending || !compiledContext} // Disable if no compiled context
          />
        </div>
      </section>

      {/* --- Right Pane --- */}
      <aside className="right-pane">
        <h3>LLM Interaction</h3>
        {/* Configuration Selection */}
        <div>
            <label htmlFor="config-select">Configuration: </label>
            <select
                id="config-select"
                value={selectedConfigId ?? ''}
                onChange={(e) => {
                    const newConfigId = e.target.value;
                    setSelectedConfigId(newConfigId);
                    // Reset model selection when config changes
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
        {/* Model Selection (dependent on selected config) */}
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
        <button
            onClick={handleSendPrompt}
            disabled={isSending || isLoading || isCompiling || !compiledContext || !query} // Disable if loading/compiling or no context/query
            style={{ marginTop: '10px', width: '100%' }}
            >
            {isSending ? 'Sending...' : 'Send to LLM'}
        </button>
        <div className="response-pane">
          <h4>Response</h4>
          {isSending && <p>Waiting for response...</p>}
          {error && <p className="error-display">Error: {error}</p>}
          <div className="response-display-area"> {/* Use a div for scroll container */}
            <ReactMarkdown
              children={llmResponse}
              components={{
                // Correctly type the code component props
                code({ node, className, children, ...props }: { node?: any; inline?: boolean; className?: string; children?: React.ReactNode }) {
                  const match = /language-(\w+)/.exec(className || '');
                  // Check if it's a block code (not inline) and has a language match
                  return match ? (
                    <SyntaxHighlighter
                      // Pass only necessary props
                      style={vscDarkPlus} // Choose your theme
                      language={match[1]}
                      PreTag="div"
                      // {...props} // Avoid spreading unknown props
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    // Render inline code or code blocks without a language tag normally
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                }
              }}
            />
          </div>
           {llmResponse && !isSending && (
             <button onClick={() => navigator.clipboard.writeText(llmResponse)} className="copy-button">
               Copy Response
             </button>
           )}
        </div>
      </aside>
    </div>
  );
}

export default App;
