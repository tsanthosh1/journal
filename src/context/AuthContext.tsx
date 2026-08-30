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
  signInWithCustomToken,
  signInWithPopup,
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
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGmailSynced, setIsGmailSynced] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | undefined>(undefined);

  const firebase = useMemo(() => getFirebaseClient(), []);

  const userEmail = user?.email || null;
  const userId = user?.email
    ? user.email.replace(/[^a-zA-Z0-9_-]/g, "_")
    : user?.uid || "";

  const isSignedIn = !!user;

  const checkGmailSyncStatus = useCallback(async () => {
    if (!user?.email && !user?.uid) {
      setIsGmailSynced(false);
      setGoogleEmail(null);
      setLastSyncAt(undefined);
      return;
    }

    try {
      const qUserId = user.email || user.uid;
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
  }, [user]);

  // Handle custom token from URL if redirected from OAuth callback
  useEffect(() => {
    if (typeof window !== "undefined" && firebase?.auth) {
      const urlParams = new URLSearchParams(window.location.search);
      const fbToken = urlParams.get("firebase_token");
      if (fbToken) {
        signInWithCustomToken(firebase.auth, fbToken)
          .then((userCred) => {
            setUser(userCred.user);
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete("firebase_token");
            window.history.replaceState({}, "", cleanUrl.toString());
          })
          .catch((err) => {
            console.error("Custom token sign-in error:", err);
          });
      }
    }
  }, [firebase]);

  useEffect(() => {
    if (!firebase) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(firebase.auth, async (currentUser) => {
      setUser(currentUser);
      setIsLoading(false);

      if (currentUser) {
        const qUserId = currentUser.email || currentUser.uid;
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
      } else {
        setIsGmailSynced(false);
        setGoogleEmail(null);
        setLastSyncAt(undefined);
      }
    });

    return () => unsubscribe();
  }, [firebase]);

  const signInWithGoogle = useCallback(
    async (returnTo?: string) => {
      if (firebase?.auth && firebase?.googleProvider) {
        try {
          const result = await signInWithPopup(firebase.auth, firebase.googleProvider);
          setUser(result.user);

          const credential = GoogleAuthProvider.credentialFromResult(result);
          if (credential?.accessToken && result.user.email) {
            await fetch("/api/auth/google/store-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userId: result.user.email,
                email: result.user.email,
                accessToken: credential.accessToken,
              }),
            }).catch(() => {});
            await checkGmailSyncStatus();
          }
          return;
        } catch (popupErr: any) {
          if (popupErr?.code === "auth/popup-closed-by-user") {
            return;
          }
          console.warn("Popup sign-in fallback to OAuth redirect:", popupErr);
        }
      }

      const currentPath =
        returnTo || (typeof window !== "undefined" ? window.location.pathname : "/subscriptions");
      window.location.href = `/api/auth/google?returnTo=${encodeURIComponent(currentPath)}`;
    },
    [firebase, checkGmailSyncStatus],
  );

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
    setGoogleEmail(null);
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
