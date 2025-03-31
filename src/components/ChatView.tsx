import React, { useState, useEffect, useRef, memo } from 'react'; // Add memo
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { LLMConfig } from '../types/llmConfig';
import { ChatMessage } from '../types/chat'; // <<< Import from new type definition file

interface ChatViewProps {
  // Keep existing relevant props
  query: string;
  setQuery: (query: string) => void;
  // llmResponse: string; // Will be managed via chatHistory now
  thinkingSteps: string;
  isSending: boolean; // Represents user sending action (preparing request)
  error: string | null;
  // handleSendPrompt: () => void; // Will be modified/replaced by onSendMessage
  llmConfigs: LLMConfig[];
  selectedConfigId: string | null;
  setSelectedConfigId: (id: string | null) => void;
  selectedModel: string | null;
  setSelectedModel: (model: string | null) => void;
  // fullPromptForCopy: string; // Context will be part of history

  // New props needed
  initialContext: string | null; // The initial system context (can be null initially)
  onSendMessage: (messages: ChatMessage[]) => void; // Function to send history to parent
  currentAssistantMessage: string | null; // Streamed response part
  isReceiving: boolean; // Flag specifically for when the assistant is responding
  chatHistory: ChatMessage[]; // Pass down the canonical history
  onGoBack: () => void; // Function to trigger going back
}

const ChatView: React.FC<ChatViewProps> = ({
  query,
  setQuery,
  thinkingSteps,
  isSending, // Flag for preparing/sending user message
  error,
  llmConfigs,
  selectedConfigId,
  setSelectedConfigId,
  selectedModel,
  setSelectedModel,
  initialContext,
  onSendMessage,
  currentAssistantMessage, // The streaming response content
  isReceiving, // Flag for when assistant is streaming
  chatHistory, // Receive history from parent
  onGoBack, // Receive go back handler
}) => {

  // const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]); // History managed by parent now
  const chatEndRef = useRef<HTMLDivElement>(null); // For scrolling

  // Effect to scroll to bottom when history or streaming message updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, currentAssistantMessage]);

  const handleLocalSend = () => {
    if (!query.trim() || isSending || isReceiving) return;

    const newUserMessage: ChatMessage = {
      id: `user-${Date.now()}`, // Simple unique ID
      role: 'user',
      content: query,
    };

    // Construct the history to send to the parent
    // Include initial context if it exists and isn't already the first message
    let historyToSend = [...chatHistory];
    if (initialContext && (historyToSend.length === 0 || historyToSend[0].role !== 'system')) {
        historyToSend.unshift({ id: 'system-init', role: 'system', content: initialContext });
    }
    historyToSend.push(newUserMessage);


    // Call the parent function to handle the actual LLM interaction
    // The parent will update the canonical chatHistory state
    onSendMessage(historyToSend);
    setQuery(''); // Clear input after initiating send
  };

  // LLM Config change handler (remains mostly the same)
  const handleConfigChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
     const newConfigId = e.target.value;
     setSelectedConfigId(newConfigId);
     const newConfig = llmConfigs.find(c => c.id === newConfigId);
     if (newConfig) {
       setSelectedModel(newConfig.defaultModel ?? (newConfig.models.length > 0 ? newConfig.models[0] : null));
     } else {
       setSelectedModel(null);
     }
  };

  // Helper to render markdown with syntax highlighting
  const renderMarkdown = (content: string) => (
    <ReactMarkdown
      children={content}
      components={{
        code({ node, className, children, ...props }: any) { // Use any for simplicity here, refine if needed
          const match = /language-(\w+)/.exec(className || '');
          // Ensure children is a string before replacing
          const codeString = String(children).replace(/\n$/, '');
          return match ? (
            <SyntaxHighlighter
              style={vscDarkPlus} // Make sure vscDarkPlus is imported
              language={match[1]}
              PreTag="div"
              className="code-block" // Add a class for potential styling
            >
              {codeString}
            </SyntaxHighlighter>
          ) : (
            <code className={`inline-code ${className || ''}`} {...props}>
              {children}
            </code>
          );
        }
      }}
    />
  );

  return (
    <section className="chat-view">
      {/* Add a header with a back button */}
      <div className="chat-view-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1rem' }}>
        <button onClick={onGoBack} style={{ padding: '0.3rem 0.8rem', marginTop: 0 }}>
          &lt; Back
        </button>
        {/* Optional: Add a title or other controls here */}
        <h4>Chat</h4>
        <div>{/* Placeholder for right-aligned items if needed */}</div>
      </div>
      <div className="chat-history-area">
        {/* Render Chat History */}
        {chatHistory.map((message) => (
          // Only render user and assistant messages in the main flow
          message.role !== 'system' && (
            <div key={message.id} className={`chat-message ${message.role}`}>
                <div className="message-header">
                    <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong>
                    {message.role === 'assistant' && (
                         <button
                            onClick={() => navigator.clipboard.writeText(message.content)}
                            className="copy-button message-copy-button"
                            title="Copy message"
                         >
                           Copy
                         </button>
                    )}
                </div>
                <div className="message-content">
                    {renderMarkdown(message.content)}
                </div>
            </div>
          )
        ))}

        {/* Display Thinking Steps (Collapsible) */}
        {isSending && thinkingSteps && ( // Show thinking toggle only when initially sending user message and steps exist
            <details className="thinking-steps-area chat-message system">
                <summary>Thinking...</summary> {/* Clickable summary */}
                <pre><code>{thinkingSteps}</code></pre> {/* Content shown when expanded */}
            </details>
        )}

        {/* Display Current Assistant Response Stream */}
        {isReceiving && currentAssistantMessage && (
             <div className="chat-message assistant streaming">
                 <div className="message-header">
                    <strong>Assistant</strong>
                 </div>
                 <div className="message-content">
                    {renderMarkdown(currentAssistantMessage)}
                 </div>
             </div>
        )}
         {isSending && !thinkingSteps && !isReceiving && <p className="chat-message system">Sending request...</p>}


        {/* Scroll anchor */}
        <div ref={chatEndRef} />
      </div>

      {/* Error Display */}
      {error && <p className="error-display">Error: {error}</p>}

      {/* Input Area */}
      <div className="chat-input-area">
         {/* LLM Configuration Selection */}
         <div className="llm-config-selector">
             <div>
                <label htmlFor="chat-config-select">Config: </label>
                <select
                    id="chat-config-select"
                    value={selectedConfigId ?? ''}
                    onChange={handleConfigChange}
                    disabled={llmConfigs.length === 0 || isSending || isReceiving} // Disable during sending/receiving
                >
                    <option value="" disabled>-- Select --</option>
                    {llmConfigs.map(config => (
                        <option key={config.id} value={config.id}>{config.name}</option>
                    ))}
                </select>
            </div>
            <div style={{ marginLeft: '0.5rem' }}>
                 <label htmlFor="chat-model-select">Model: </label>
                 <select
                    id="chat-model-select"
                    value={selectedModel ?? ''}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    disabled={!selectedConfigId || isSending || isReceiving} // Disable during sending/receiving
                 >
                    <option value="" disabled>-- Select --</option>
                    {llmConfigs.find(c => c.id === selectedConfigId)?.models.map(modelName => (
                         <option key={modelName} value={modelName}>{modelName}</option>
                    ))}
                 </select>
            </div>
         </div>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter your message..."
          rows={3}
          disabled={isSending || isReceiving || !selectedConfigId || !selectedModel} // Disable during sending/receiving
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault(); // Prevent newline
              handleLocalSend();
            }
          }}
        />
        {/* Wrapper for buttons */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '0.5rem' }}>
            <button
              onClick={handleLocalSend}
              disabled={isSending || isReceiving || !query || !selectedConfigId || !selectedModel} // Disable during sending/receiving
            >
              {isSending ? 'Preparing...' : (isReceiving ? 'Responding...' : 'Send')}
            </button>
            {/* Removed the 'Copy Full Prompt' button */}
        </div>
      </div>
    </section>
  );
};

export default memo(ChatView); // Wrap export with React.memo