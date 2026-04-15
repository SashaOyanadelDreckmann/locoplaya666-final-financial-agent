'use client';

import { useEffect, useRef } from 'react';
import type { ChatThread, ChatItem } from '@/lib/agent.response.types';

interface ChatPanelProps {
  activeThread: ChatThread | null;
  loading: boolean;
  onAddMessage: (content: string) => Promise<void>;
  onThreadChange: (threadId: string) => void;
}

/**
 * Componente refactorizado para gestionar el panel de chat
 * Extraído de agent/page.tsx para mejorar mantenibilidad
 */
export function ChatPanel({ activeThread, loading, onAddMessage, onThreadChange }: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeThread?.items]);

  const handleSubmit = async () => {
    const input = inputRef.current?.value.trim();
    if (!input || loading) return;

    try {
      await onAddMessage(input);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error submitting message:', error);
    }
  };

  if (!activeThread) {
    return (
      <div className="chat-panel-empty">
        <p>Selecciona un chat para comenzar</p>
      </div>
    );
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <h2>{activeThread.name}</h2>
      </div>

      <div className="chat-messages">
        {activeThread.items.map((item: ChatItem, idx: number) => (
          <div key={idx} className={`message message-${item.role}`}>
            <p>{item.content}</p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <textarea
          ref={inputRef}
          placeholder="Escribe tu mensaje..."
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit();
            }
          }}
        />
        <button onClick={handleSubmit} disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar'}
        </button>
      </div>
    </div>
  );
}

export default ChatPanel;
