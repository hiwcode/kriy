"use client";

import * as React from "react";
import {
  getCurrentUser,
  getCachedUserInfo,
  clearCachedUserInfo,
  type UserInfo,
} from "@/lib/api/users";
import { useAuth } from "@/components/auth/auth-provider";

interface CurrentUserContextValue {
  user: UserInfo | null;
  isLoading: boolean;
  /** The numeric user ID for use in API calls (replaces email-based userId). */
  userId: string;
  refresh: () => Promise<void>;
}

const CurrentUserContext = React.createContext<CurrentUserContextValue>({
  user: null,
  isLoading: true,
  userId: "user",
  refresh: async () => {},
});

export function useCurrentUser() {
  return React.useContext(CurrentUserContext);
}

export function CurrentUserProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = useAuth();
  const [user, setUser] = React.useState<UserInfo | null>(() =>
    getCachedUserInfo()
  );
  const [isLoading, setIsLoading] = React.useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const u = await getCurrentUser();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (auth?.isSignedIn) {
      // Try cached first, then refresh in background
      const cached = getCachedUserInfo();
      if (cached) {
        setUser(cached);
        setIsLoading(false);
        // Still refresh in background to ensure freshness
        refresh();
      } else {
        refresh();
      }
    } else {
      clearCachedUserInfo();
      setUser(null);
      setIsLoading(false);
    }
  }, [auth?.isSignedIn, refresh]);

  const userId = user ? String(user.id) : "user";

  const value = React.useMemo<CurrentUserContextValue>(
    () => ({ user, isLoading, userId, refresh }),
    [user, isLoading, userId, refresh]
  );

  return (
    <CurrentUserContext.Provider value={value}>
      {children}
    </CurrentUserContext.Provider>
  );
}
