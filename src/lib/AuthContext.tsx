import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { updatePresence } from './services';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  displayName: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const login = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      if (error?.code === 'auth/cancelled-popup-request' || error?.code === 'auth/popup-closed-by-user') {
        return;
      }
      console.error('Login failed:', error);
      alert(`Login failed: ${error?.message || 'Please ensure Google login is enabled in your Firebase console.'}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logout = async () => {
    if (user) {
      await updatePresence(user.uid, false);
    }
    return signOut(auth);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      setLoading(false);
      
      if (authUser) {
        updatePresence(authUser.uid, true);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const handleBeforeUnload = () => {
      updatePresence(user.uid, false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        updatePresence(user.uid, false);
      } else {
        updatePresence(user.uid, true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, displayName: user?.displayName || null }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
