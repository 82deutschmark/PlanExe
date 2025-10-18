/**
 * Author: ChatGPT (gpt-5-codex)
 * Date: 2025-10-30
 * PURPOSE: Conversation-first modal that renders the live SSE transcript,
 *          reasoning buffers, and advanced overrides used by the redesigned
 *          landing page flow.
 * SRP and DRY check: Pass - purely presentational; orchestration lives in the
 *          useResponsesConversation hook.
 */

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ConversationAdvancedOptions, ConversationMessage } from '@/hooks/useResponsesConversation';

export interface ConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ConversationMessage[];
  isStreaming: boolean;
  canFinalize: boolean;
  isFinalizing: boolean;
  error: string | null;
  onSendFollowup: (message: string) => Promise<void>;
  onFinalize: () => Promise<void>;
  advancedOptions: ConversationAdvancedOptions;
  onAdvancedOptionsChange: (options: ConversationAdvancedOptions) => void;
}

export const ConversationModal: React.FC<ConversationModalProps> = ({
  isOpen,
  onClose,
  messages,
  isStreaming,
  canFinalize,
  isFinalizing,
  error,
  onSendFollowup,
  onFinalize,
  advancedOptions,
  onAdvancedOptionsChange,
}) => {
  const [followup, setFollowup] = useState('');
  const [localOverrides, setLocalOverrides] = useState<ConversationAdvancedOptions>(advancedOptions);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  useEffect(() => {
    setLocalOverrides(advancedOptions);
  }, [advancedOptions]);

  const assistantMessage = useMemo(() => messages.find((message) => message.role === 'assistant' && message.status !== 'pending'), [messages]);

  const handleFollowupSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!followup.trim()) return;
    setIsSubmitting(true);
    try {
      await onSendFollowup(followup.trim());
      setFollowup('');
      setFinalizeError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send follow-up message.';
      setFinalizeError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinalize = async () => {
    setFinalizeError(null);
    try {
      await onFinalize();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to finalise conversation.';
      setFinalizeError(message);
    }
  };

  const handleOverrideChange = (partial: Partial<ConversationAdvancedOptions>) => {
    setLocalOverrides((prev) => ({ ...prev, ...partial }));
  };

  const persistOverrides = () => {
    onAdvancedOptionsChange(localOverrides);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl gap-6 p-0 sm:p-0">
        <DialogHeader className="space-y-1 border-b border-slate-200 p-6">
          <DialogTitle className="text-xl font-semibold text-slate-900">Conversation preview</DialogTitle>
          <DialogDescription className="text-sm text-slate-500">
            Stream responses, review reasoning, then finalise to launch the Luigi pipeline.
          </DialogDescription>
          {(error || finalizeError) && (
            <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error || finalizeError}
            </div>
          )}
        </DialogHeader>

        <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <section className="flex flex-col gap-4">
            <header className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Timeline</h3>
              {isStreaming && <Badge variant="outline" className="animate-pulse border-sky-300 text-sky-700">Streaming</Badge>}
            </header>
            <div className="flex flex-col gap-4 overflow-y-auto rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`rounded-md border p-3 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'border-indigo-100 bg-indigo-50 text-indigo-900'
                      : 'border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  <header className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide">
                    <span>{message.role === 'user' ? 'You' : 'Assistant'}</span>
                    <span className="text-slate-400">{new Date(message.createdAt).toLocaleTimeString()}</span>
                  </header>
                  <p className="whitespace-pre-wrap text-sm">{message.content || '…'}</p>
                  {message.reasoning && (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">
                      <span className="font-semibold uppercase tracking-wide text-slate-400">Reasoning</span>
                      <br />
                      {message.reasoning}
                    </p>
                  )}
                  {message.jsonChunks.length > 0 && (
                    <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-900/90 p-3 text-xs text-slate-100">
                      {message.jsonChunks.map((chunk, index) => (
                        <div key={`${message.id}-json-${index}`} className="mb-2 last:mb-0">
                          {chunk}
                        </div>
                      ))}
                    </pre>
                  )}
                </article>
              ))}
              {messages.length === 0 && (
                <p className="text-center text-sm text-slate-500">Start a conversation to see the transcript.</p>
              )}
            </div>

            <form onSubmit={handleFollowupSubmit} className="mt-auto space-y-3">
              <Label htmlFor="followup" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Send follow-up prompt
              </Label>
              <Textarea
                id="followup"
                value={followup}
                onChange={(event) => setFollowup(event.target.value)}
                placeholder="Add constraints, clarify goals, or ask for revisions."
                rows={3}
                className="resize-none"
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">Follow-ups spawn a new streaming response.</p>
                <Button type="submit" disabled={!followup.trim() || isSubmitting || isStreaming}>
                  {isSubmitting ? 'Sending…' : 'Send follow-up'}
                </Button>
              </div>
            </form>
          </section>

          <section className="flex flex-col gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Live output</h3>
              <div className="mt-3 space-y-3">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Assistant</h4>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
                    {assistantMessage?.content?.trim() ? assistantMessage.content : 'Waiting for response…'}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Reasoning</h4>
                  <p className="mt-2 whitespace-pre-wrap text-xs text-slate-500">
                    {assistantMessage?.reasoning?.trim() ? assistantMessage.reasoning : 'Reasoning summary will appear here.'}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Structured deltas</h4>
                  <pre className="mt-2 max-h-52 overflow-auto rounded bg-slate-900/90 p-3 text-xs text-slate-100">
                    {assistantMessage?.jsonChunks?.length
                      ? assistantMessage.jsonChunks.map((chunk, index) => (
                          <div key={`delta-${index}`} className="mb-2 last:mb-0">
                            {chunk}
                          </div>
                        ))
                      : 'JSON deltas will accumulate here.'}
                  </pre>
                </div>
              </div>
            </div>

            <Accordion type="single" collapsible className="rounded-lg border border-slate-200 bg-white shadow-sm">
              <AccordionItem value="overrides">
                <AccordionTrigger className="px-4 py-3 text-sm font-medium text-slate-700">
                  Advanced options
                </AccordionTrigger>
                <AccordionContent className="space-y-4 px-4 pb-4 text-sm text-slate-700">
                  <div className="space-y-2">
                    <Label htmlFor="modelOverride" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Model override
                    </Label>
                    <Input
                      id="modelOverride"
                      value={localOverrides.modelOverride ?? ''}
                      onChange={(event) => handleOverrideChange({ modelOverride: event.target.value || null })}
                      placeholder="e.g. gpt-5-mini"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Speed vs detail
                    </Label>
                    <Select
                      value={localOverrides.speedVsDetail ?? 'balanced_speed_and_detail'}
                      onValueChange={(value) =>
                        handleOverrideChange({ speedVsDetail: value as ConversationAdvancedOptions['speedVsDetail'] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select cadence" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fast_but_skip_details">Fast (lean)</SelectItem>
                        <SelectItem value="balanced_speed_and_detail">Balanced</SelectItem>
                        <SelectItem value="all_details_but_slow">Meticulous</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="openrouterKey" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      OpenRouter API key (optional)
                    </Label>
                    <Input
                      id="openrouterKey"
                      value={localOverrides.openrouterApiKey}
                      onChange={(event) => handleOverrideChange({ openrouterApiKey: event.target.value })}
                      placeholder="sk-or-..."
                      type="password"
                    />
                  </div>
                  <Button type="button" variant="outline" className="w-full" onClick={persistOverrides}>
                    Apply overrides
                  </Button>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>
        </div>

        <DialogFooter className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-slate-500">
            The assistant output becomes the plan prompt once you finalise. You can continue iterating before launching.
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={isFinalizing}>
              Cancel
            </Button>
            <Button type="button" onClick={handleFinalize} disabled={!canFinalize || isFinalizing}>
              {isFinalizing ? 'Finalising…' : 'Finalise payload'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConversationModal;
