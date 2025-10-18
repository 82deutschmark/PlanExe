/**
 * Author: ChatGPT (gpt-5-codex)
 * Date: 2025-10-30
 * PURPOSE: Inline command-palette style launcher for the conversation-first
 *          landing flow, collecting the seed prompt and lightweight context
 *          tags before opening the modal.
 * SRP and DRY check: Pass - strictly captures input state and delegates all
 *          orchestration to the conversation hook.
 */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export interface PromptLauncherPayload {
  prompt: string;
  tags: string[];
}

export interface PromptLauncherProps {
  onLaunch: (payload: PromptLauncherPayload) => Promise<void> | void;
  isDisabled?: boolean;
}

const HELPER_TAGS = ['Executive brief', 'Ops handoff', 'Deep dive'];

export const PromptLauncher: React.FC<PromptLauncherProps> = ({ onLaunch, isDisabled }) => {
  const [prompt, setPrompt] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    await onLaunch({ prompt: prompt.trim(), tags });
    setPrompt('');
  };

  const toggleTag = (tag: string) => {
    setTags((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]));
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <label htmlFor="prompt-launcher" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Describe what you want to execute
          </label>
          <Input
            id="prompt-launcher"
            ref={inputRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="e.g. Launch a market expansion plan for LATAM fintech partnerships"
            className="h-12 rounded-xl border-slate-200 bg-slate-50/80 text-base"
            disabled={isDisabled}
            autoComplete="off"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="font-medium text-slate-400">Quick context:</span>
          {HELPER_TAGS.map((tag) => {
            const active = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="rounded-full bg-indigo-100 text-indigo-700">
                {tag}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-400">Enter to open the conversation. You can iterate before committing.</p>
          <Button type="submit" disabled={!prompt.trim() || isDisabled}>
            Start conversation
          </Button>
        </div>
      </form>
    </div>
  );
};

export default PromptLauncher;
