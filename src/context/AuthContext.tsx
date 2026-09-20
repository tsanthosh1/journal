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
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signInWithCustomToken,
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
  userId: "",
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
  const [isLoading, setIsLoading] = useState(true);
  const [isGmailSynced, setIsGmailSynced] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>(undefined);

  const firebase = useMemo(() => getFirebaseClient(), []);

  // Strict User Identification: Only derived from verified Firebase Auth user
  const userEmail = user?.email || null;
  const userId = user?.email
    ? user.email.replace(/[^a-zA-Z0-9_-]/g, "_")
    : user?.uid || "";

  const isSignedIn = !!user;

  const checkGmailSyncStatus = useCallback(async () => {
    if (!user?.email && !user?.uid) {
      setIsGmailSynced(false);
      setLastSyncAt(undefined);
      return;
    }

    try {
      const qUserId = user.email || user.uid || "";
      const res = await fetch(
        `/api/auth/google/status?userId=${encodeURIComponent(qUserId)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setIsGmailSynced(data.connected);
        setLastSyncAt(data.lastSyncAt);
      }
    } catch {
      // ignore
    }
  }, [user]);

  // Handle Firebase Custom Token or Google ID Token from Server-Side OAuth redirect
  useEffect(() => {
    if (typeof window !== "undefined" && firebase?.auth) {
      const url = new URL(window.location.href);
      const customToken = url.searchParams.get("firebase_token");
      const googleIdToken = url.searchParams.get("google_id_token");
      const googleAccessToken = url.searchParams.get("google_access_token");

      if (customToken) {
        setIsLoading(true);
        signInWithCustomToken(firebase.auth, customToken)
          .then((cred) => {
            setUser(cred.user);
            checkGmailSyncStatus();
          })
          .catch((err) => {
            console.error("Firebase custom token signin error:", err);
          })
          .finally(() => {
            setIsLoading(false);
            url.searchParams.delete("firebase_token");
            url.searchParams.delete("auth");
            window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
          });
      } else if (googleIdToken) {
        setIsLoading(true);
        const credential = GoogleAuthProvider.credential(googleIdToken, googleAccessToken || undefined);
        signInWithCredential(firebase.auth, credential)
          .then((cred) => {
            setUser(cred.user);
            checkGmailSyncStatus();
          })
          .catch((err) => {
            console.error("Firebase Google credential signin error:", err);
          })
          .finally(() => {
            setIsLoading(false);
            url.searchParams.delete("google_id_token");
            url.searchParams.delete("google_access_token");
            url.searchParams.delete("auth");
            window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
          });
      } else if (url.searchParams.get("auth") === "success") {
        url.searchParams.delete("auth");
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
      }
    }
  }, [firebase, checkGmailSyncStatus]);

  // Cryptographic Firebase Auth Listener (Source of Truth)
  useEffect(() => {
    if (!firebase) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(firebase.auth, async (currentUser) => {
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        const hasPendingToken =
          url.searchParams.has("google_id_token") ||
          url.searchParams.has("firebase_token");
        if (!currentUser && hasPendingToken) {
          // Do not reset loading while pending OAuth redirect token is being exchanged
          return;
        }
      }

      setUser(currentUser);
      setIsLoading(false);

      if (currentUser) {
        const qUserId = currentUser.email || currentUser.uid;
        try {
          const res = await fetch(
            `/api/auth/google/status?userId=${encodeURIComponent(qUserId)}`,
          );
          if (res.ok) {
            const data = await res.json();
            setIsGmailSynced(data.connected);
            setLastSyncAt(data.lastSyncAt);
          }
        } catch {
          // ignore
        }
      } else {
        setIsGmailSynced(false);
        setLastSyncAt(undefined);
      }
    });

    return () => unsubscribe();
  }, [firebase]);

  const signInWithGoogle = useCallback(async (returnTo?: string) => {
    if (typeof window !== "undefined") {
      setIsLoading(true);
      const destination =
        returnTo || window.location.pathname + window.location.search || "/";
      const qUserId = user?.email || user?.uid || "default_user";
      // Direct full-page OAuth redirect (avoids popup cross-origin cookie blockage)
      window.location.href = `/api/auth/google?userId=${encodeURIComponent(qUserId)}&returnTo=${encodeURIComponent(destination)}`;
    }
  }, [user]);

  const signOut = useCallback(async () => {
    if (firebase) {
      await fbSignOut(firebase.auth).catch(() => {});
    }
    if (user?.email || user?.uid) {
      const qUserId = user.email || user.uid;
      await fetch(`/api/auth/google/status?userId=${encodeURIComponent(qUserId)}`, {
        method: "DELETE",
      }).catch(() => {});
    }

    setUser(null);
    setIsGmailSynced(false);
    setLastSyncAt(undefined);
    window.location.reload();
  }, [firebase, user]);

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
