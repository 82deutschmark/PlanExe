/**
 * Author: gpt-5-codex
 * Date: 2025-10-30
 * PURPOSE: Message bubble component for conversation display with role-based styling.
 * SRP and DRY check: Pass - focused solely on message presentation.
 */

'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';
import { ConversationMessage } from '@/lib/conversation/useResponsesConversation';

interface MessageBubbleProps {
  message: ConversationMessage;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message }) => {
  return (
    <article
      className={`rounded-lg border shadow-sm ${
        message.role === 'assistant'
          ? 'mx-auto max-w-4xl bg-gradient-to-br from-indigo-900/60 to-purple-900/40 border-indigo-700/50 px-6 py-5'
          : 'bg-indigo-950/40 border-indigo-800 px-5 py-4 ml-auto max-w-2xl'
      }`}
    >
      <header className="mb-3 flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
        <span className={message.role === 'assistant' ? 'text-indigo-300' : 'text-slate-400'}>
          {message.role === 'assistant' ? '🤖 PlanExe Agent' : 'You'}
        </span>
        <span className="text-slate-500">
          {new Date(message.createdAt).toLocaleTimeString()}
        </span>
      </header>
      <p className={`whitespace-pre-wrap leading-relaxed ${
        message.role === 'assistant' ? 'text-base text-slate-100' : 'text-sm text-slate-200'
      }`}>
        {message.content || (message.streaming ? 'Thinking…' : '')}
      </p>
      {message.streaming && (
        <div className="mt-3 flex items-center gap-2 text-xs text-indigo-300">
          <Loader2 className="h-3 w-3 animate-spin" />
          Agent drafting response…
        </div>
      )}
    </article>
  );
};
