"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  onAuthStateChanged,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { getFirebaseClient, isFirebaseConfigured } from "@/lib/firebase";

interface AuthContextType {
  user: User | null;
  userId: string;
  userEmail: string | null;
  isSignedIn: boolean;
  isLoading: boolean;
  isFirebaseConfigured: boolean;
  isGmailSynced: boolean;
  lastSyncAt?: string;
  signInWithGoogle: (returnTo?: string) => Promise<void>;
  signOut: () => Promise<void>;
  checkGmailSyncStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userId: "default_user",
  userEmail: null,
  isSignedIn: false,
  isLoading: true,
  isFirebaseConfigured: false,
  isGmailSynced: false,
  signInWithGoogle: async () => {},
  signOut: async () => {},
  checkGmailSyncStatus: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGmailSynced, setIsGmailSynced] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>(undefined);

  const firebase = useMemo(() => getFirebaseClient(), []);

  const userEmail = user?.email || googleEmail || null;
  const userId = user?.email
    ? user.email.replace(/[^a-zA-Z0-9_-]/g, "_")
    : googleEmail
    ? googleEmail.replace(/[^a-zA-Z0-9_-]/g, "_")
    : user?.uid || "default_user";

  const isSignedIn = !!user || isGmailSynced || !!googleEmail;

  const checkGmailSyncStatus = useCallback(async () => {
    try {
      const qUserId = user?.email || googleEmail || user?.uid || "default_user";
      const res = await fetch(`/api/auth/google/status?userId=${encodeURIComponent(qUserId)}`);
      if (res.ok) {
        const data = await res.json();
        setIsGmailSynced(data.connected);
        setLastSyncAt(data.lastSyncAt);
        if (data.email) {
          setGoogleEmail(data.email);
        }
      }
    } catch {
      // ignore
    }
  }, [user, googleEmail]);

  useEffect(() => {
    // Initial check on mount
    checkGmailSyncStatus();

    if (!firebase) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(firebase.auth, async (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);
      const qUserId = currentUser?.email || currentUser?.uid || "default_user";
      try {
        const res = await fetch(`/api/auth/google/status?userId=${encodeURIComponent(qUserId)}`);
        if (res.ok) {
          const data = await res.json();
          setIsGmailSynced(data.connected);
          setLastSyncAt(data.lastSyncAt);
          if (data.email) {
            setGoogleEmail(data.email);
          }
        }
      } catch {
        // ignore
      }
    });

    return () => unsubscribe();
  }, [firebase, checkGmailSyncStatus]);

  const signInWithGoogle = useCallback(async (returnTo?: string) => {
    const currentPath =
      returnTo || (typeof window !== "undefined" ? window.location.pathname : "/subscriptions");
    window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(currentPath)}`;
  }, []);

  const signOut = useCallback(async () => {
    if (firebase) {
      await fbSignOut(firebase.auth).catch(() => {});
    }
    const qUserId = user?.email || googleEmail || user?.uid || "default_user";
    await fetch(`/api/auth/google/status?userId=${encodeURIComponent(qUserId)}`, {
      method: "DELETE",
    }).catch(() => {});

    setUser(null);
    setGoogleEmail(null);
    setIsGmailSynced(false);
    setLastSyncAt(undefined);
    window.location.reload();
  }, [firebase, user, googleEmail]);

  return (
    <AuthContext.Provider
      value={{
        user,
        userId,
        userEmail,
        isSignedIn,
        isLoading,
        isFirebaseConfigured,
        isGmailSynced,
        lastSyncAt,
        signInWithGoogle,
        signOut,
        checkGmailSyncStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
