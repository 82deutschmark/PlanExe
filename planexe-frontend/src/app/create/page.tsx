/**
 * Author: Cascade
 * Date: 2025-10-26
 * PURPOSE: Full-featured plan creation page using the detailed PlanForm component.
 * SRP and DRY check: Pass - dedicated route for advanced plan creation interface.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlanForm } from '@/components/planning/PlanForm';
import { ConversationModal } from '@/components/planning/ConversationModal';
import { useConfigStore } from '@/lib/stores/config';
import { CreatePlanRequest, fastApiClient } from '@/lib/api/fastapi-client';
import { ConversationFinalizeResult } from '@/lib/conversation/useResponsesConversation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CreatePlanPage: React.FC = () => {
  const router = useRouter();
  const { llmModels, promptExamples, loadLLMModels, loadPromptExamples } = useConfigStore();
  const [isCreating, setIsCreating] = useState(false);
  const [isConversationOpen, setIsConversationOpen] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<CreatePlanRequest | null>(null);
  const [conversationSessionKey, setConversationSessionKey] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);

  useEffect(() => {
    loadLLMModels();
    loadPromptExamples();
  }, [loadLLMModels, loadPromptExamples]);

  const generateConversationSessionKey = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `conversation-${crypto.randomUUID()}`;
    }
    return `conversation-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  const handlePlanSubmit = async (data: CreatePlanRequest) => {
    setIsCreating(true);
    setConversationSessionKey(generateConversationSessionKey());
    setPendingRequest(data);
    setIsConversationOpen(true);
  };

  const resetConversationState = () => {
    setIsConversationOpen(false);
    setPendingRequest(null);
    setConversationSessionKey(null);
    setIsCreating(false);
  };

  const handleConversationClose = () => {
    resetConversationState();
  };

  const handleConversationFinalize = async (
    result: ConversationFinalizeResult,
  ): Promise<void> => {
    if (!pendingRequest) {
      throw new Error('No pending request to finalise.');
    }

    setIsFinalizing(true);

    try {
      const payload: CreatePlanRequest = {
        ...pendingRequest,
        prompt: result.enrichedPrompt,
        enriched_intake: result.enrichedIntake ?? undefined,
      };

      const plan = await fastApiClient.createPlan(payload);

      // Copy concept image from conversationId to planId in sessionStorage
      if (typeof window !== 'undefined' && conversationSessionKey) {
        try {
          const convKey = `planexe_concept_image_${conversationSessionKey}`;
          const imageData = sessionStorage.getItem(convKey);
          if (imageData) {
            const planKey = `planexe_concept_image_${plan.plan_id}`;
            sessionStorage.setItem(planKey, imageData);
            console.log('[CreatePlan] Concept image linked to plan ID');
          }
        } catch (error) {
          console.warn('[CreatePlan] Failed to link concept image to plan:', error);
        }
      }

      resetConversationState();

      const workspaceUrl = `/recovery?planId=${encodeURIComponent(plan.plan_id)}`;
      router.push(workspaceUrl);
    } catch (err) {
      console.error('[CreatePlan] Plan creation failed:', err);
      throw err;
    } finally {
      setIsFinalizing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="sm">
                <Link href="/">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Home
                </Link>
              </Button>
              <h1 className="text-2xl font-semibold text-slate-900">Create New Plan</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <PlanForm
          onSubmit={handlePlanSubmit}
          isSubmitting={isCreating || isFinalizing}
          llmModels={llmModels}
          promptExamples={promptExamples}
          loadLLMModels={loadLLMModels}
        />
      </main>

      <ConversationModal
        isOpen={isConversationOpen}
        request={pendingRequest}
        sessionKey={conversationSessionKey}
        onClose={handleConversationClose}
        onFinalize={handleConversationFinalize}
        isFinalizing={isFinalizing}
      />
    </div>
  );
};

export default CreatePlanPage;
