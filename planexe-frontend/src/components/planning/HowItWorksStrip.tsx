/**
 * Author: gpt-5-codex
 * Date: 2025-10-31
 * PURPOSE: Compact strip explaining the 3-step PlanExe process
 * SRP and DRY check: Pass - Simple presentational component with no business logic
 */

'use client';

import React from 'react';

export const HowItWorksStrip: React.FC = () => {
  return (
    <section id="how-it-works" className="border-t border-white/10 bg-white/5 backdrop-blur">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-semibold text-white mb-2">How it works</h2>
          <p className="text-sm text-slate-400">Three clear steps from idea to execution plan</p>
        </div>
        <div className="grid gap-8 md:grid-cols-3">
          <div className="text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <span className="text-lg font-bold text-emerald-400">1</span>
            </div>
            <h3 className="text-lg font-medium text-white">Intake</h3>
            <p className="text-sm text-slate-300">
              Short dialogue to collect the essentials and clarify your objectives.
            </p>
          </div>
          <div className="text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
              <span className="text-lg font-bold text-amber-400">2</span>
            </div>
            <h3 className="text-lg font-medium text-white">Pipeline</h3>
            <p className="text-sm text-slate-300">
              61 tasks generate structured outputs. Track progress live in the workspace.
            </p>
          </div>
          <div className="text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
              <span className="text-lg font-bold text-cyan-400">3</span>
            </div>
            <h3 className="text-lg font-medium text-white">Report</h3>
            <p className="text-sm text-slate-300">
              Downloadable HTML report and artefacts ready for execution.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
