/**
 * Author: ChatGPT using gpt-5-codex
 * Date: 2025-10-26T00:00:00Z
 * PURPOSE: Inline modal to pick missing sections (per-task checkboxes) and resume options
 *          like model and speed, replacing prompt-based selection for better UX.
 * SRP and DRY check: Pass - focused on selection UI and confirmation only; resume logic
 *          remains in the recovery page controller.
 */
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CreatePlanRequest, MissingSectionResponse } from '@/lib/api/fastapi-client';

interface ResumeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  missing: MissingSectionResponse[];
  defaultModel?: string | null;
  defaultSpeed?: CreatePlanRequest['speed_vs_detail'];
  defaultReasoningEffort?: CreatePlanRequest['reasoning_effort'];
  onConfirm: (payload: {
    selectedFilenames: string[];
    llmModel?: string | null;
    speedVsDetail: CreatePlanRequest['speed_vs_detail'];
    reasoningEffort?: CreatePlanRequest['reasoning_effort'];
  }) => void | Promise<void>;
}

export const ResumeDialog: React.FC<ResumeDialogProps> = ({
  open,
  onOpenChange,
  missing,
  defaultModel = null,
  defaultSpeed = 'balanced_speed_and_detail',
  defaultReasoningEffort = 'medium',
  onConfirm,
}) => {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [model, setModel] = useState<string>(defaultModel ?? '');
  const [speed, setSpeed] = useState<CreatePlanRequest['speed_vs_detail']>(defaultSpeed);
  const [reasoningEffort, setReasoningEffort] = useState<CreatePlanRequest['reasoning_effort']>(defaultReasoningEffort);

  useEffect(() => {
    // Initialize all as selected by default when dialog opens
    if (open) {
      const initial: Record<string, boolean> = {};
      for (const item of missing) {
        if (item?.filename) initial[item.filename] = true;
      }
      setSelected(initial);
      setModel(defaultModel ?? '');
      setSpeed(defaultSpeed);
      setReasoningEffort(defaultReasoningEffort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(missing)]);

  const grouped = useMemo(() => {
    const byStage = new Map<string, MissingSectionResponse[]>();
    for (const item of missing) {
      const key = (item.stage ?? 'unknown').toString();
      const arr = byStage.get(key) ?? [];
      arr.push(item);
      byStage.set(key, arr);
    }
    return Array.from(byStage.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [missing]);

  const selectedCount = useMemo(() => Object.values(selected).filter(Boolean).length, [selected]);

  const toggleAll = (value: boolean) => {
    const updated: Record<string, boolean> = {};
    for (const item of missing) {
      if (item?.filename) updated[item.filename] = value;
    }
    setSelected(updated);
  };

  const handleConfirm = () => {
    const filenames = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => k);
    onConfirm({ 
      selectedFilenames: filenames, 
      llmModel: model.trim() || null, 
      speedVsDetail: speed,
      reasoningEffort 
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Resume Missing Sections</DialogTitle>
          <DialogDescription>
            Select the specific tasks to resume and optionally adjust model and speed. Already completed content will be skipped.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-auto pr-1">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700">Missing items: {missing.length}</span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => toggleAll(true)}>Select All</Button>
              <Button variant="outline" size="sm" onClick={() => toggleAll(false)}>Clear All</Button>
            </div>
          </div>

          {grouped.map(([stage, items]) => (
            <div key={stage} className="rounded-md border border-amber-200 bg-amber-50">
              <div className="border-b border-amber-200 px-3 py-2 text-sm font-medium text-amber-900">{stage}</div>
              <ul className="divide-y divide-amber-200">
                {items.map((item) => (
                  <li key={item.filename} className="flex items-start gap-3 px-3 py-2">
                    <input
                      id={`ms-${item.filename}`}
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-600"
                      checked={!!selected[item.filename]}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [item.filename]: e.target.checked }))}
                    />
                    <div className="flex-1">
                      <label htmlFor={`ms-${item.filename}`} className="block text-sm font-medium text-slate-900">
                        {item.filename}
                      </label>
                      <div className="text-xs text-slate-600">{item.reason}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="resume-model">LLM Model (optional)</Label>
              <Input id="resume-model" placeholder="e.g. gpt-4.1" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="resume-speed">Speed vs detail</Label>
              <Select value={speed} onValueChange={(v) => setSpeed(v as CreatePlanRequest['speed_vs_detail'])}>
                <SelectTrigger id="resume-speed" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fast_but_skip_details">Fast, fewer details</SelectItem>
                  <SelectItem value="balanced_speed_and_detail">Balanced (default)</SelectItem>
                  <SelectItem value="all_details_but_slow">All details, slower</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="resume-reasoning">Reasoning effort</Label>
              <Select value={reasoningEffort} onValueChange={(v) => setReasoningEffort(v as CreatePlanRequest['reasoning_effort'])}>
                <SelectTrigger id="resume-reasoning" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minimal">Minimal (fastest)</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium (balanced)</SelectItem>
                  <SelectItem value="high">High (most thorough)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={selectedCount === 0}>Resume {selectedCount > 0 ? `(${selectedCount})` : ''}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
