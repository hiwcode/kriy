"use client";

import * as React from "react";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import type { CredentialResponse } from "@react-oauth/google";
import {
  clearAuthToken,
  ensureAuthModeForToken,
  getAuthToken,
  getAuthUser,
  getRefreshToken,
  setAccessToken,
  setAuthToken,
  setRefreshToken,
  tokenExpiresIn,
} from "@/lib/auth";
import { exchangeGoogleCredential, refreshSession, logoutSession } from "@/lib/api/auth";
import { clearCachedUserInfo } from "@/lib/api/users";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

interface AuthContextValue {
  user: { email: string; name: string; picture?: string } | null;
  isSignedIn: boolean;
  isLoading: boolean;
  signIn: () => void;
  signOut: () => void;
  signInButton: React.ReactNode;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<{ email: string; name: string; picture?: string } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const loginRef = React.useRef<HTMLDivElement | null>(null);

  const handleCredentialResponse = React.useCallback(async (response: CredentialResponse) => {
    const credential = response.credential;
    if (!credential) return;
    try {
      // Exchange the Google credential for our own session (access + refresh).
      const { access_token, refresh_token, user: profile } =
        await exchangeGoogleCredential(credential);
      setAuthToken(access_token, profile);
      setRefreshToken(refresh_token);
      setUser(profile);
    } catch (err) {
      console.error("Sign-in failed:", err);
    }
  }, []);

  const signIn = React.useCallback(() => {
    loginRef.current?.querySelector<HTMLButtonElement>("button")?.click();
  }, []);

  const signInButton = (
    <div ref={loginRef}>
      <GoogleLogin
        onSuccess={handleCredentialResponse}
        onError={() => console.error("Google login failed")}
        useOneTap={false}
        theme="filled_black"
        size="medium"
        text="signin_with"
        shape="rectangular"
      />
    </div>
  );

  React.useEffect(() => {
    const token = getAuthToken();
    const storedUser = getAuthUser();
    if (token && storedUser) {
      setUser(storedUser);
      ensureAuthModeForToken();
    }
    setIsLoading(false);
  }, []);

  // Token refresh: swap in a fresh access token via our backend before it expires.
  // No Google One Tap / FedCM involved — works in every browser.
  React.useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      const remaining = tokenExpiresIn();
      if (remaining <= 0) return;
      // Refresh 5 minutes before expiry, minimum 10 seconds from now.
      const refreshIn = Math.max((remaining - 300) * 1000, 10_000);
      timer = setTimeout(async () => {
        if (cancelled) return;
        const rt = getRefreshToken();
        if (!rt) return;
        try {
          const { access_token, refresh_token } = await refreshSession(rt);
          setAccessToken(access_token);
          // Refresh tokens are now single-use — persist the rotated one.
          if (refresh_token) setRefreshToken(refresh_token);
          schedule(); // schedule the next refresh
        } catch {
          // Refresh token expired/revoked — require a fresh sign-in.
          clearAuthToken();
          setUser(null);
        }
      }, refreshIn);
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user]);

  const signOut = React.useCallback(() => {
    const rt = getRefreshToken();
    if (rt) logoutSession(rt).catch(() => {});
    clearAuthToken();
    clearCachedUserInfo();
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    isSignedIn: !!user,
    isLoading,
    signIn,
    signOut,
    signInButton,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  if (!GOOGLE_CLIENT_ID) {
    return (
      <AuthContext.Provider
        value={{
          user: null,
          isSignedIn: false,
          isLoading: false,
          signIn: () => {},
          signOut: () => {},
          signInButton: null,
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </GoogleOAuthProvider>
  );
}

export function useAuth() {
  const ctx = React.useContext(AuthContext);
  return ctx;
}
