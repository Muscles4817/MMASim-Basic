/**
 * Toasts: one line saying an action worked, or why it did not.
 *
 * The planner's actions changed the save and said nothing. Sending nine offers produced chips
 * changing colour somewhere down a twelve-row card; pencilling a callout onto next month's card
 * changed a screen the player was not looking at. A toast is the receipt.
 *
 * Announced through one polite live region rather than per toast, so a screen reader hears each
 * once and a burst of them queues rather than interrupting. They leave on their own, and never
 * carry anything the player must act on — that is the inbox's job.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import './toast.css';

export type ToastTone = 'info' | 'good' | 'warn';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastValue {
  toast(message: string, tone?: ToastTone): void;
}

const ToastContext = createContext<ToastValue | undefined>(undefined);

/** How long a toast stays, in ms. Long enough to read a sentence twice. */
const TOAST_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  // A provider unmounted mid-toast (a test ending, the app torn down) must not set state later.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const toast = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = (next.current += 1);
    // Three at most: past that they are a log, and the oldest have been read.
    setToasts((all) => [...all.slice(-2), { id, message, tone }]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((all) => all.filter((t) => t.id !== id));
    }, TOAST_MS);
    timers.current.add(timer);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <p key={t.id} className={`toast toast--${t.tone}`}>
            {t.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * The toast function, or a no-op outside a provider — a screen mounted on its own in a test
 * should not have to know toasts exist.
 */
export function useToast(): ToastValue['toast'] {
  return useContext(ToastContext)?.toast ?? noop;
}

const noop = (): void => {};
