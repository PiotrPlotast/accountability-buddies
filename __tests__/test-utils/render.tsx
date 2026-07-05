import React, { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  renderHook,
  waitFor,
  RenderHookResult,
} from "@testing-library/react-native";

import { SupabaseContext } from "@/context/supabase-context";
import { useSupabase } from "@/hooks/useSupabase";

export type QueryBuilderResult<T = unknown> = {
  data?: T;
  error?: { message: string } | null;
};

/**
 * Build a chainable PostgREST-like query builder. Every `from(...).insert/.select/.eq...`
 * chain returns the same proxy object. Awaiting it resolves to `result`.
 */
export function makeQueryBuilder<T = unknown>(result: QueryBuilderResult<T>) {
  const qb: Record<string, unknown> = {};
  const methods = [
    "insert",
    "update",
    "delete",
    "upsert",
    "select",
    "eq",
    "neq",
    "in",
    "match",
    "single",
    "maybeSingle",
    "order",
    "limit",
  ];
  for (const m of methods) qb[m] = jest.fn(() => qb);
  // Make it thenable so `await qb.insert(...).select().single()` resolves.
  qb.then = (
    resolve?: ((v: QueryBuilderResult<T>) => unknown) | null,
    reject?: ((reason: unknown) => unknown) | null,
  ) => Promise.resolve(result).then(resolve, reject);
  return qb as Record<string, jest.Mock> & PromiseLike<QueryBuilderResult<T>>;
}

interface FakeSupabaseOpts {
  userId?: string;
  fromImpl?: jest.Mock;
  rpcImpl?: jest.Mock;
}

export function buildFakeSupabase({
  userId = "user-1",
  fromImpl,
  rpcImpl,
}: FakeSupabaseOpts = {}) {
  const subscription = { unsubscribe: jest.fn() };
  const session = userId
    ? {
        user: {
          id: userId,
          email: "u@example.com",
          created_at: "2025-01-01T00:00:00Z",
        },
      }
    : null;

  const supabase = {
    // jest.setup.js's useSupabase mock reads __testSession off of this object.
    __testSession: session,
    auth: {
      getSession: jest.fn(() =>
        Promise.resolve({ data: { session }, error: null }),
      ),
      onAuthStateChange: jest.fn(() => ({ data: { subscription } })),
      signOut: jest.fn(() => Promise.resolve({ error: null })),
      signInWithPassword: jest.fn(() => Promise.resolve({ error: null })),
      signUp: jest.fn(() => Promise.resolve({ error: null })),
      verifyOtp: jest.fn(() => Promise.resolve({ error: null })),
      startAutoRefresh: jest.fn(),
      stopAutoRefresh: jest.fn(),
    },
    from: fromImpl ?? jest.fn(() => makeQueryBuilder({ error: null })),
    rpc:
      rpcImpl ?? jest.fn(() => makeQueryBuilder({ data: null, error: null })),
  };
  return supabase as unknown as SupabaseClient;
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        // Keep seeded test data alive: gcTime must be > 0 or unobserved
        // queries (the cache the mutations write to without subscribing)
        // are dropped immediately. staleTime/refetch flags suppress
        // background refetches replacing seeded data.
        gcTime: Infinity,
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false },
    },
  });
}

interface WrapperProps {
  children: ReactNode;
}

export function buildWrapper(opts?: {
  supabase?: SupabaseClient;
  queryClient?: QueryClient;
}) {
  const queryClient = opts?.queryClient ?? makeQueryClient();
  const supabase = opts?.supabase ?? buildFakeSupabase();
  const Wrapper = ({ children }: WrapperProps) => (
    <QueryClientProvider client={queryClient}>
      <SupabaseContext.Provider value={supabase}>
        {children}
      </SupabaseContext.Provider>
    </QueryClientProvider>
  );
  return { Wrapper, queryClient, supabase };
}

/**
 * Render a hook and wait for the SupabaseProvider to hydrate the session.
 * Hooks that touch `useSupabase` need to observe a non-null session before
 * mutations will run; otherwise `useOptimisticGoalMutation` short-circuits
 * with "No user".
 */
export async function renderHookWithSession<T>(
  hookFactory: () => T,
  Wrapper: React.ComponentType<WrapperProps>,
): Promise<RenderHookResult<{ session: unknown; value: T }, unknown>> {
  const utils = renderHook(
    () => ({ session: useSupabase().session, value: hookFactory() }),
    { wrapper: Wrapper },
  );
  await waitFor(() => {
    expect(utils.result.current.session).toBeTruthy();
  });
  return utils;
}
