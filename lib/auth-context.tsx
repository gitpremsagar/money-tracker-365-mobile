import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  loginRequest,
  logoutRequest,
  refreshSession,
  registerAccessTokenHandlers,
  signupRequest,
  type AuthUser,
} from './api';

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (input: { email: string; password: string }) => Promise<void>;
  signup: (input: { name: string; email: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    registerAccessTokenHandlers({
      getAccessToken: () => accessToken,
      onAccessTokenRefreshed: (token) => {
        setAccessToken(token);
        if (!token) {
          setUser(null);
        }
      },
    });
  }, [accessToken]);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      try {
        const session = await refreshSession();

        if (!isMounted || !session) {
          return;
        }

        setAccessToken(session.accessToken);
        setUser(session.user);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = useCallback(async (input: { email: string; password: string }) => {
    const result = await loginRequest(input);
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const signup = useCallback(
    async (input: { name: string; email: string; password: string }) => {
      const result = await signupRequest(input);
      setAccessToken(result.accessToken);
      setUser(result.user);
    },
    [],
  );

  const logout = useCallback(async () => {
    await logoutRequest(accessToken);
    setAccessToken(null);
    setUser(null);
  }, [accessToken]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      isLoading,
      login,
      signup,
      logout,
    }),
    [user, accessToken, isLoading, login, signup, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
