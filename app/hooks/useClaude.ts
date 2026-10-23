import { useState } from "react";
import { loadApiKey, loadModel, loadVia, runJob, saveApiKey, saveModel, saveVia, type ClaudeModel, type ClaudeVia, type Job } from "../claude.ts";

/** A copy-and-paste request the writer closed: nothing to report. */
export const CANCELLED = new Error("cancelled");

type Handoff = { job: Job<unknown>; resolve: (v: unknown) => void; reject: (e: Error) => void };

/** How Intent asks Claude (key, model, API or copy and paste), and what it's doing now. */
export function useClaude() {
  const [apiKey, setKey] = useState(loadApiKey);
  const [model, setModelState] = useState<ClaudeModel>(loadModel);
  const [via, setViaState] = useState<ClaudeVia>(loadVia);
  const [busy, setBusy] = useState<string | null>(null);
  const [handoff, setHandoff] = useState<Handoff | null>(null);

  const run = <T,>(job: Job<T>) => {
    setBusy(`Claude: ${job.title}…`);
    return runJob(apiKey, model, job).finally(() => setBusy(null));
  };

  // Every ✦ job goes through here: on the API key, or by copy and paste when there's no key
  // or the writer prefers it. A closed hand-off rejects with CANCELLED and changes nothing.
  const askClaude = <T,>(job: Job<T>, forcePaste = false): Promise<T> => {
    if (apiKey && via === "api" && !forcePaste) return run(job);
    return new Promise<T>((resolve, reject) => setHandoff({ job: job as Job<unknown>, resolve: resolve as (v: unknown) => void, reject }));
  };

  return {
    apiKey, model, via, busy, handoff, askClaude,
    setApiKey: (k: string) => (saveApiKey(k), setKey(k.trim())),
    setModel: (m: ClaudeModel) => (saveModel(m), setModelState(m)),
    setVia: (v: ClaudeVia) => (saveVia(v), setViaState(v)),
    answerHandoff: (v: unknown) => (handoff?.resolve(v), setHandoff(null)),
    cancelHandoff: () => (handoff?.reject(CANCELLED), setHandoff(null)),
    /** Run a pasted job on the key after all. */
    handoffOnKey: apiKey ? () => { const h = handoff!; setHandoff(null); run(h.job).then(h.resolve, h.reject); } : undefined,
  };
}
