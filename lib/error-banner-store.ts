"use client";

  import { useEffect, useState } from "react";

  export type BannerVariant = "info" | "warning" | "error";
  export type BannerState = {
    message: string;
    variant: BannerVariant;
    actionLabel?: string;
    onAction?: () => void;
  } | null;

  let current: BannerState = null;
  const listeners = new Set<(state: BannerState) => void>();

  export function showBanner(state: NonNullable<BannerState>): void {
    current = state;
    listeners.forEach((fn) => fn(current));
  }

  export function clearBanner(): void {
    current = null;
    listeners.forEach((fn) => fn(current));
  }

  export function useErrorBanner(): BannerState {
    const [state, setState] = useState<BannerState>(current);
    useEffect(() => {
      listeners.add(setState);
      return () => {
        listeners.delete(setState);
      };
    }, []);
    return state;
  }
