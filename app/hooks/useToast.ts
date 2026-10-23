import { useState } from "react";

export type ToastAction = { label: string; run: () => void };
export type Say = (msg: string, ms?: number, action?: ToastAction | null) => void;

/** One short message at the bottom of the screen, optionally with one action (Undo). */
export function useToast() {
  const [toast, setToast] = useState("");
  const [action, setAction] = useState<ToastAction | null>(null);
  const say: Say = (msg, ms = 2500, act = null) => {
    setToast(msg);
    setAction(act);
    setTimeout(() => setToast((t) => (t === msg ? "" : t)), ms);
  };
  const runAction = () => {
    action?.run();
    setAction(null);
    setToast("");
  };
  return { toast, action, say, runAction };
}
