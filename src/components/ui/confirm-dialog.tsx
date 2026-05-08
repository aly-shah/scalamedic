"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue>({
  confirm: () => Promise.resolve(false),
});

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const handleClose = (result: boolean) => {
    state?.resolve(result);
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}

      {state && (
        <>
          <div className="fixed inset-0 z-[90] bg-stone-900/25 backdrop-blur-sm" onClick={() => handleClose(false)} />
          <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-[91] w-[min(420px,calc(100vw-2rem))] bg-white rounded-[var(--radius-drawer)] shadow-[var(--shadow-surface-3)] p-6 animate-fade-in">
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${state.variant === "danger" ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-500"}`}>
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-stone-900">{state.title}</h3>
                <p className="text-sm text-stone-500 mt-1">{state.message}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <Button variant="outline" onClick={() => handleClose(false)}>
                {state.cancelLabel || "Cancel"}
              </Button>
              <Button variant={state.variant === "danger" ? "danger" : "primary"} onClick={() => handleClose(true)}>
                {state.confirmLabel || "Confirm"}
              </Button>
            </div>
          </div>
        </>
      )}
    </ConfirmContext.Provider>
  );
}
