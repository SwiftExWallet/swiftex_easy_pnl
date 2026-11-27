import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StellarPnlClient } from "./client";
import type { StellarPnlResponse, UseStellarPnlOptions, UseStellarPnlResult } from "./types";

export function useStellarPnl(options: UseStellarPnlOptions): UseStellarPnlResult {
  const {
    walletAddress,
    apiKey,
    baseUrl,
    startDate,
    endDate,
    timeframe = "30D",
    summary = false,
    enabled = true,
    onError,
  } = options;

  const [data, setData] = useState<StellarPnlResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const client = useMemo(
    () => new StellarPnlClient({ baseUrl, apiKey }),
    [baseUrl, apiKey]
  );

  const refetch = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let active = true;

    setIsLoading(true);
    setError(null);

    client
      .getPnl({
        address: walletAddress,
        startDate,
        endDate,
        timeframe,
        summary,
        nocache: refreshTick > 0,
        signal: controller.signal,
      })
      .then((res) => {
        if (!active) return;
        setData(res);
        setIsLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        const normalizedErr = err instanceof Error ? err : new Error(String(err));
        setError(normalizedErr);
        setIsLoading(false);
        onErrorRef.current?.(normalizedErr);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [client, walletAddress, startDate, endDate, timeframe, summary, enabled, refreshTick]);

  return { data, isLoading, error, refetch };
}

