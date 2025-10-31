/**
 * Author: gpt-5-codex
 * Date: 2025-10-30
 * PURPOSE: Collapsible inline reasoning panel for displaying LLM reasoning traces
 *          within the conversation flow.
 * SRP and DRY check: Pass - focused on reasoning display with collapse/expand UX.
 */

'use client';

import React, { useState } from 'react';
import { Brain, ChevronDown, ChevronUp } from 'lucide-react';

interface InlineReasoningPanelProps {
  reasoning: string;
}

export const InlineReasoningPanel: React.FC<InlineReasoningPanelProps> = ({ reasoning }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!reasoning) {
    return null;
  }

  return (
    <div className="my-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors"
      >
        <Brain className="h-4 w-4 text-purple-400" />
        <span>View reasoning ({reasoning.length} characters)</span>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {isOpen && (
        <div className="mt-2 rounded-lg border border-slate-700 bg-slate-900 p-4">
          <pre className="text-xs text-slate-300 whitespace-pre-wrap overflow-x-auto font-mono">
            {reasoning}
          </pre>
        </div>
      )}
    </div>
  );
};
