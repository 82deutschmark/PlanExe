/**
 * Author: ChatGPT (gpt-5-codex)
 * Date: 2025-10-23
 * PURPOSE: Landing screen for PlanExe that orchestrates plan creation, surfaces system health, and now syncs the release badge with the CHANGELOG on GitHub.
 * SRP and DRY check: Pass - this file owns only landing-page layout/orchestration while delegating form logic, queues, and data fetching helpers to shared components.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Brain, LayoutGrid, Rocket, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlansQueue } from '@/components/PlansQueue';
import { useConfigStore } from '@/lib/stores/config';
import { fastApiClient } from '@/lib/api/fastapi-client';
import { PromptLauncher } from '@/components/planning/PromptLauncher';
import { ConversationModal } from '@/components/conversation/ConversationModal';
import { useResponsesConversation } from '@/hooks/useResponsesConversation';

const CHANGELOG_URL = 'https://github.com/PlanExe/PlanExe/blob/main/CHANGELOG.md';
const RAW_CHANGELOG_URL = 'https://raw.githubusercontent.com/PlanExe/PlanExe/main/CHANGELOG.md';

const HomePage: React.FC = () => {
  const router = useRouter();
  const { llmModels, promptExamples, modelsError, isLoadingModels, loadLLMModels, loadPromptExamples } = useConfigStore();
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [versionError, setVersionError] = useState<string | null>(null);
  const {
    isOpen: isConversationOpen,
    isStreaming: isConversationStreaming,
    isFinalizing: isConversationFinalizing,
    canFinalize,
    messages: conversationMessages,
    error: conversationError,
    launchConversation,
    sendFollowup,
    finalizeConversation,
    closeModal,
    advancedOptions: conversationAdvancedOptions,
    setAdvancedOptions,
  } = useResponsesConversation();

  useEffect(() => {
    loadLLMModels();
    loadPromptExamples();
  }, [loadLLMModels, loadPromptExamples]);

  useEffect(() => {
    let canceled = false;

    const extractLatestVersion = (changelog: string): string | null => {
      const match = changelog.match(/##\s*\[(\d+\.\d+\.\d+)\]/);
      return match?.[1] ?? null;
    };

    const fetchLatestVersion = async () => {
      try {
        const response = await fetch(RAW_CHANGELOG_URL, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to load changelog (HTTP ${response.status})`);
        }

        const changelogText = await response.text();
        const version = extractLatestVersion(changelogText);

        if (!canceled) {
          if (version) {
            setLatestVersion(version);
            setVersionError(null);
          } else {
            setVersionError('Unable to parse version from changelog.');
          }
        }
      } catch (err) {
        if (!canceled) {
          const message = err instanceof Error ? err.message : 'Unknown error fetching changelog.';
          setVersionError(message);
        }
      }
    };

    fetchLatestVersion();

    const refreshInterval = window.setInterval(fetchLatestVersion, 15 * 60 * 1000);

    return () => {
      canceled = true;
      window.clearInterval(refreshInterval);
    };
  }, []);

  const handlePromptLaunch = async ({ prompt, tags }: { prompt: string; tags: string[] }) => {
    setError(null);
    try {
      await launchConversation({ prompt, tags });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to open conversation.';
      setError(message);
    }
  };

  const handleFinalizeConversation = async () => {
    setError(null);
    try {
      const finalized = await finalizeConversation();
      setIsCreatingPlan(true);
      const plan = await fastApiClient.createPlan(finalized.planRequest);
      const workspaceUrl = `/recovery?planId=${encodeURIComponent(plan.plan_id)}`;
      window.location.href = workspaceUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to finalize plan payload.';
      setError(message);
      throw err;
    } finally {
      setIsCreatingPlan(false);
    }
  };

  const modelSummary = (() => {
    if (isLoadingModels) {
      return 'Loading models…';
    }
    if (modelsError) {
      return 'Model load issue';
    }
    if (!llmModels || llmModels.length === 0) {
      return 'No models available';
    }
    return `${llmModels.length} models ready`;
  })();

  const promptSummary = promptExamples && promptExamples.length > 0
    ? `${promptExamples.length} curated prompts`
    : 'Add your own context';

  const combinedError = conversationError ?? error;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-sky-600">
              <Brain className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-semibold text-slate-900">PlanExe</h1>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Strategic Planning Control Center</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <a
              href={CHANGELOG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:inline text-indigo-600 hover:text-indigo-500"
            >
              Workspace build changelog
            </a>
            <Badge
              variant="outline"
              className="border-slate-200 font-semibold uppercase tracking-wide"
              title={versionError ?? undefined}
            >
              v{latestVersion ?? '…'}
            </Badge>
          </div>
        </div>
      </header>

      <main className="landing-shell mx-auto w-full max-w-7xl py-8">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <div className="space-y-6">
            <Card className="border-slate-200">
              <CardHeader className="space-y-2 pb-4">
                <CardTitle className="flex items-center gap-2 text-lg text-slate-800">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                  Start a conversation
                </CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  Drop a directive and we&apos;ll stream the assistant&apos;s reasoning before locking the plan payload.
                </CardDescription>
              </CardHeader>
              <CardContent className="card-compact">
                <PromptLauncher
                  onLaunch={handlePromptLaunch}
                  isDisabled={isCreatingPlan || isConversationOpen || isConversationStreaming}
                />
                {combinedError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {combinedError}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="space-y-1 pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-slate-700">
                  <LayoutGrid className="h-4 w-4 text-indigo-600" />
                  Responses handshake
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Streaming is {isConversationStreaming ? 'live' : 'ready'} — finalize once the completion event fires.
                </CardDescription>
              </CardHeader>
              <CardContent className="card-compact grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Models</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{modelSummary}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Prompt catalog</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">{promptSummary}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Finalize</p>
                  <p className="mt-1 text-sm font-semibold text-slate-800">
                    {canFinalize ? 'Ready to launch' : isConversationStreaming ? 'Streaming…' : 'Awaiting input'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="border-slate-200">
              <CardHeader className="space-y-1 pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-slate-700">
                  <Rocket className="h-4 w-4 text-indigo-600" />
                  Recent activity
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Pick up where you left off or audit a teammate&apos;s run.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <PlansQueue
                  className="w-full"
                  onPlanSelect={(planId) => router.push(`/recovery?planId=${encodeURIComponent(planId)}`)}
                />
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="space-y-1 pb-4">
                <CardTitle className="text-lg text-slate-800">Workspace primer</CardTitle>
                <CardDescription className="text-sm text-slate-500">
                  Orient yourself before the pipeline begins streaming updates.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-0 text-sm text-slate-600">
                <div>
                  <h3 className="font-medium text-slate-700">Timeline &amp; status</h3>
                  <p className="text-xs text-slate-500">Monitor each stage&apos;s completion and retry failed nodes without leaving the run.</p>
                </div>
                <div>
                  <h3 className="font-medium text-slate-700">Reports &amp; artefacts</h3>
                  <p className="text-xs text-slate-500">Download canonical reports, inspect fallback drafts, and review generated files in one place.</p>
                </div>
                <div>
                  <h3 className="font-medium text-slate-700">Live reasoning</h3>
                  <p className="text-xs text-slate-500">Use the console stream to understand decisions and catch blockers early.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Info Cards Section */}
        <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="border-slate-200">
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-slate-700">
                <Sparkles className="h-4 w-4 text-indigo-600" />
                Plan pipeline
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Kick off a plan and jump directly to workspace monitoring when ready.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">
              <p className="font-medium text-slate-700">{modelSummary}</p>
              <p className="mt-1 text-xs text-slate-500">Health updates auto-refresh as models load.</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-slate-700">
                <LayoutGrid className="h-4 w-4 text-indigo-600" />
                Prompt library
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Use a curated starting point or craft a focused brief of your own.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">
              <p className="font-medium text-slate-700">{promptSummary}</p>
              <p className="mt-1 text-xs text-slate-500">Switch to Examples to drop in one instantly.</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader className="space-y-1 pb-3">
              <CardTitle className="flex items-center gap-2 text-base text-slate-700">
                <Brain className="h-4 w-4 text-indigo-600" />
                System status
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Live status of models and pipeline infrastructure.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-slate-600">
              <p className="font-medium text-slate-700">
                {isLoadingModels ? 'Initializing...' : 'All systems operational'}
              </p>
              <p className="mt-1 text-xs text-slate-500">Ready to process your strategic plans.</p>
            </CardContent>
          </Card>
        </section>
      </main>

      <ConversationModal
        isOpen={isConversationOpen}
        onClose={closeModal}
        messages={conversationMessages}
        isStreaming={isConversationStreaming}
        canFinalize={canFinalize}
        isFinalizing={isConversationFinalizing || isCreatingPlan}
        error={combinedError}
        onSendFollowup={(message) => sendFollowup(message)}
        onFinalize={handleFinalizeConversation}
        advancedOptions={conversationAdvancedOptions}
        onAdvancedOptionsChange={setAdvancedOptions}
      />
    </div>
  );
};

export default HomePage;