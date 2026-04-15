import { FormEvent, type ChangeEvent, createContext, useContext, useEffect, useMemo, useState } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import EmotionTimeline, { type EmotionTimelinePoint } from "./components/EmotionTimeline";

type UnlockEventRule = {
  type: "birthday" | "exam" | "breakup" | "custom";
  date?: string;
  metadata?: {
    personName?: string;
    eventName?: string;
  };
};

type Capsule = {
  id: string;
  title: string;
  body: string | null;
  createdAt: string;
  mediaUrl?: string;
  unlockAt?: string;
  unlockEventRules?: UnlockEventRule;
  status: "draft" | "locked" | "released";
  dominantEmotion?: string;
  analyzedAt?: string;
  emotionLabels?: string[];
  sentimentScore?: number;
};

type UserProfile = {
  id: string;
  email: string;
  fullName?: string;
  profilePicUrl?: string;
  bio?: string;
};

type AuthPayload = {
  user: UserProfile;
  accessToken: string;
  refreshToken: string;
};

type RegisterStartResponse = {
  message: string;
  email: string;
  otpExpiresInMinutes: number;
};

type UpdateProfilePayload = {
  fullName: string;
  profilePicUrl?: string;
  bio?: string;
};
type NotificationItem = {
  id: string;
  kind: "created" | "opened";
  message: string;
  capsuleTitle: string;
  createdAt: string;
};

type AppContextValue = {
  token: string | null;
  user: UserProfile | null;
  capsules: Capsule[];
  notifications: NotificationItem[];
  loading: boolean;
  error: string | null;
  clearError: () => void;
  login: (email: string, password: string) => Promise<void>;
  startRegister: (payload: {
    fullName: string;
    email: string;
    password: string;
    profilePicUrl?: string;
    bio?: string;
  }) => Promise<RegisterStartResponse>;
  verifyRegistrationOtp: (email: string, otp: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<void>;
  updateProfile: (payload: UpdateProfilePayload) => Promise<void>;
  logout: () => Promise<void>;
  createCapsule: (payload: {
    title: string;
    body: string;
    mediaUrl?: string;
    unlockAt?: string;
    unlockKey: string;
    unlockEventRules?: UnlockEventRule;
  }) => Promise<void>;
  lockCapsule: (capsuleId: string, unlockAt: string) => Promise<void>;
  simulateRelease: (capsuleId: string) => Promise<void>;
  unlockCapsuleWithKey: (capsuleId: string, unlockKey: string) => Promise<void>;
  deleteCapsule: (capsuleId: string) => Promise<void>;
  deleteNotification: (notificationId: string) => void;
  clearNotifications: () => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function resolveApiBaseUrl(): string {
  const configuredApiBase = import.meta.env.VITE_API_BASE_URL;

  if (configuredApiBase) {
    return configuredApiBase;
  }

  if (import.meta.env.DEV) {
    return "http://localhost:4000";
  }

  throw new Error(
    "Missing VITE_API_BASE_URL. Set it in your production environment to your deployed API URL before building the web app."
  );
}

const apiBase = resolveApiBaseUrl();

function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within provider");
  }
  return context;
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T & { error?: string }) : ({} as T & { error?: string });

  if (!response.ok) {
    if (response.status === 401 && token) {
      localStorage.removeItem("soulsafe_access");
      localStorage.removeItem("soulsafe_refresh");
      localStorage.removeItem("soulsafe_user");
      localStorage.removeItem("soulsafe_notifications");

      if (window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }

    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return payload as T;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(file);
  });
}

function toLocalDateTimeValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function heightClass(percent: number): string {
  const clamped = Math.max(10, Math.min(100, Math.round(percent / 10) * 10));
  return `h-${clamped}`;
}

function App() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("soulsafe_access"));
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem("soulsafe_refresh"));
  const [user, setUser] = useState<UserProfile | null>(() => {
    const raw = localStorage.getItem("soulsafe_user");
    return raw ? (JSON.parse(raw) as UserProfile) : null;
  });
  const [capsules, setCapsules] = useState<Capsule[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    const raw = localStorage.getItem("soulsafe_notifications");
    if (!raw) {
      return [];
    }

    try {
      return JSON.parse(raw) as NotificationItem[];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function makeNotificationId(): string {
    return globalThis.crypto?.randomUUID?.() || `notification-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function pushNotification(input: Omit<NotificationItem, "id" | "createdAt">): void {
    const notification: NotificationItem = {
      ...input,
      id: makeNotificationId(),
      createdAt: new Date().toISOString()
    };

    setNotifications((current) => [notification, ...current].slice(0, 25));
  }

  function deleteNotification(notificationId: string): void {
    setNotifications((current) => current.filter((notification) => notification.id !== notificationId));
  }

  function clearNotifications(): void {
    setNotifications([]);
  }

  async function loadCapsules(accessToken: string): Promise<void> {
    const data = await request<Capsule[]>("/capsules", {}, accessToken);
    setCapsules(data);
  }

  function clearError() {
    setError(null);
  }

  function applyUserProfile(updatedUser: UserProfile): void {
    setUser(updatedUser);
    localStorage.setItem("soulsafe_user", JSON.stringify(updatedUser));
  }

  async function applyAuthPayload(payload: AuthPayload): Promise<void> {
    setToken(payload.accessToken);
    setRefreshToken(payload.refreshToken);
    applyUserProfile(payload.user);

    localStorage.setItem("soulsafe_access", payload.accessToken);
    localStorage.setItem("soulsafe_refresh", payload.refreshToken);

    await loadCapsules(payload.accessToken);
  }

  async function login(email: string, password: string) {
    setLoading(true);
    setError(null);

    try {
      const payload = await request<AuthPayload>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });
      await applyAuthPayload(payload);
    } catch (authError) {
      setError((authError as Error).message);
      throw authError;
    } finally {
      setLoading(false);
    }
  }

  async function startRegister(payload: {
    fullName: string;
    email: string;
    password: string;
    profilePicUrl?: string;
    bio?: string;
  }) {
    setLoading(true);
    setError(null);

    try {
      return await request<RegisterStartResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });
    } catch (registerError) {
      setError((registerError as Error).message);
      throw registerError;
    } finally {
      setLoading(false);
    }
  }

  async function verifyRegistrationOtp(email: string, otp: string) {
    setLoading(true);
    setError(null);

    try {
      const payload = await request<AuthPayload>("/auth/verify-email-otp", {
        method: "POST",
        body: JSON.stringify({ email, otp })
      });
      await applyAuthPayload(payload);
    } catch (verifyError) {
      setError((verifyError as Error).message);
      throw verifyError;
    } finally {
      setLoading(false);
    }
  }

  async function requestPasswordReset(email: string) {
    setLoading(true);
    setError(null);

    try {
      await request<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email })
      });
    } catch (requestError) {
      setError((requestError as Error).message);
      throw requestError;
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(email: string, otp: string, newPassword: string) {
    setLoading(true);
    setError(null);

    try {
      const payload = await request<AuthPayload>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ email, otp, newPassword })
      });
      await applyAuthPayload(payload);
    } catch (resetError) {
      setError((resetError as Error).message);
      throw resetError;
    } finally {
      setLoading(false);
    }
  }

  async function updateProfile(payload: UpdateProfilePayload) {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await request<{ message: string; user: UserProfile }>(
        "/auth/profile",
        {
          method: "PUT",
          body: JSON.stringify(payload)
        },
        token
      );

      applyUserProfile(response.user);
    } catch (profileError) {
      setError((profileError as Error).message);
      throw profileError;
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    if (refreshToken) {
      try {
        await request("/auth/logout", {
          method: "POST",
          body: JSON.stringify({ refreshToken })
        });
      } catch {
        // Ignore logout API errors and clear local session anyway.
      }
    }

    setToken(null);
    setRefreshToken(null);
    setUser(null);
    setCapsules([]);
    setNotifications([]);

    localStorage.removeItem("soulsafe_access");
    localStorage.removeItem("soulsafe_refresh");
    localStorage.removeItem("soulsafe_user");
    localStorage.removeItem("soulsafe_notifications");
  }

  async function createCapsule(payload: {
    title: string;
    body: string;
    mediaUrl?: string;
    unlockAt?: string;
    unlockKey: string;
    unlockEventRules?: UnlockEventRule;
  }) {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const createdCapsule = await request<Capsule>(
        "/capsules",
        {
          method: "POST",
          body: JSON.stringify(payload)
        },
        token
      );
      pushNotification({
        kind: "created",
        capsuleTitle: createdCapsule.title,
        message: `You created a capsule: ${createdCapsule.title}`
      });
      await loadCapsules(token);
    } catch (capsuleError) {
      setError((capsuleError as Error).message);
      throw capsuleError;
    } finally {
      setLoading(false);
    }
  }

  async function lockCapsule(capsuleId: string, unlockAt: string) {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await request(
        `/capsules/${capsuleId}/lock`,
        {
          method: "POST",
          body: JSON.stringify({ unlockAt })
        },
        token
      );
      await loadCapsules(token);
    } catch (lockError) {
      setError((lockError as Error).message);
      throw lockError;
    } finally {
      setLoading(false);
    }
  }

  async function simulateRelease(capsuleId: string) {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const releasedCapsule = await request<Capsule>(`/capsules/${capsuleId}/simulate-release`, { method: "POST" }, token);
      pushNotification({
        kind: "opened",
        capsuleTitle: releasedCapsule.title,
        message: `Your capsule is opened: ${releasedCapsule.title}`
      });
      await loadCapsules(token);
    } catch (releaseError) {
      setError((releaseError as Error).message);
      throw releaseError;
    } finally {
      setLoading(false);
    }
  }

  async function unlockCapsuleWithKey(capsuleId: string, unlockKey: string) {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const releasedCapsule = await request<Capsule>(
        `/capsules/${capsuleId}/unlock-with-key`,
        {
          method: "POST",
          body: JSON.stringify({ unlockKey })
        },
        token
      );

      pushNotification({
        kind: "opened",
        capsuleTitle: releasedCapsule.title,
        message: `Your capsule is opened: ${releasedCapsule.title}`
      });

      await loadCapsules(token);
    } catch (unlockError) {
      setError((unlockError as Error).message);
      throw unlockError;
    } finally {
      setLoading(false);
    }
  }

  async function deleteCapsule(capsuleId: string) {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await request<void>(`/capsules/${capsuleId}`, { method: "DELETE" }, token);
      setCapsules((current) => current.filter((capsule) => capsule.id !== capsuleId));
    } catch (deleteError) {
      setError((deleteError as Error).message);
      throw deleteError;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!token) {
      return;
    }

    loadCapsules(token).catch((loadError) => setError((loadError as Error).message));
  }, [token]);

  useEffect(() => {
    localStorage.setItem("soulsafe_notifications", JSON.stringify(notifications));
  }, [notifications]);

  const contextValue = useMemo<AppContextValue>(
    () => ({
      token,
      user,
      capsules,
      notifications,
      loading,
      error,
      clearError,
      login,
      startRegister,
      verifyRegistrationOtp,
      requestPasswordReset,
      resetPassword,
      updateProfile,
      logout,
      createCapsule,
      lockCapsule,
      simulateRelease,
      unlockCapsuleWithKey,
      deleteCapsule,
      deleteNotification,
      clearNotifications
    }),
    [token, user, capsules, notifications, loading, error]
  );

  return (
    <AppContext.Provider value={contextValue}>
      <Routes>
        <Route path="/" element={<WelcomePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardHomePage />} />
          <Route path="services/capsules" element={<CapsuleServicePage />} />
          <Route path="services/capsules/:capsuleId" element={<CapsuleDetailPage />} />
          <Route path="services/ai" element={<AiServicePage />} />
          <Route path="services/recommendations" element={<RecommendationServicePage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppContext.Provider>
  );
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { token } = useAppContext();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}

function WelcomePage() {
  const [isWelcomeNavOpen, setIsWelcomeNavOpen] = useState(false);

  const navItems = [
    { label: "Home", to: "/" },
    { label: "About", to: "/about" },
    { label: "Features", to: "/about" },
    { label: "Support", to: "/about" },
    { label: "FAQ", to: "/about" }
  ];

  const featureCards = [
    { title: "Encrypted Memories", body: "Private by default with layered access controls." },
    { title: "Smart Release", body: "Time-locked delivery for messages that matter." },
    { title: "AI Context", body: "Emotional insights that deepen every capsule." }
  ];

  return (
    <div className="welcome-shell" id="home">
      <div className="welcome-backdrop" aria-hidden="true">
        <div className="welcome-sky" />
        <div className="welcome-glow glow-left" />
        <div className="welcome-glow glow-right" />
        <div className="welcome-mountain mountain-back" />
        <div className="welcome-mountain mountain-front" />
        <div className="welcome-haze" />
      </div>

      <header className="welcome-topbar">
        <Link to="/login" className="welcome-brand" aria-label="SoulSafe login">
          <span className="brand-mark">S</span>
          <span className="brand-copy">
            <strong>SoulSafe</strong>
            <span>AI memory capsules</span>
          </span>
        </Link>

        <nav className={isWelcomeNavOpen ? "welcome-nav open" : "welcome-nav"} aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link key={item.label} to={item.to} onClick={() => setIsWelcomeNavOpen(false)}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="welcome-actions">
          <button
            type="button"
            className="welcome-menu-toggle"
            aria-label="Toggle welcome navigation"
            aria-expanded={isWelcomeNavOpen ? "true" : "false"}
            onClick={() => setIsWelcomeNavOpen((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>
          <Link to="/login" className="btn btn-ghost welcome-login-link">
            Login
          </Link>
        </div>
      </header>

      <main className="welcome-hero" id="app">
        <section className="welcome-copy">
          <p className="hero-kicker">Next-generation memory vault</p>
          <h1>Awesome memory app for private messages, future moments, and AI-guided release.</h1>
          <p className="hero-description">
            SoulSafe blends encrypted capsules, email-verified access, and timed delivery into a dramatic
            mobile-first experience that feels alive at every stage.
          </p>

          <div className="hero-cta-row">
            <Link to="/login" className="store-btn store-btn-primary">
              <span className="store-icon" aria-hidden="true">⬇</span>
              <span>
                <strong>App Store</strong>
                <small>Login to continue</small>
              </span>
            </Link>
            <Link to="/login" className="store-btn store-btn-secondary">
              <span className="store-icon" aria-hidden="true">▶</span>
              <span>
                <strong>Google Play</strong>
                <small>Login to continue</small>
              </span>
            </Link>
          </div>

          <div className="hero-features" id="features">
            {featureCards.map((feature) => (
              <article key={feature.title} className="feature-pill-card">
                <h2>{feature.title}</h2>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="welcome-showcase" id="team" aria-label="App showcase">
          <div className="floating-card floating-card-left">
            <span className="floating-dot" />
            <strong>Pure CSS vibes</strong>
            <p>Layered gradients, glow, and motion without any external art.</p>
          </div>

          <div className="phone-frame">
            <div className="phone-notch" />
            <div className="phone-screen">
              <div className="phone-screen-top">
                <span>My private capsule</span>
                <span className="status-chip">Live</span>
              </div>
              <div className="phone-metric">
                <span className="phone-metric-label">Sentiment</span>
                <strong>1,270</strong>
                <div className="phone-bars">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="phone-grid">
                <div>
                  <span>870</span>
                  <small>encrypted</small>
                </div>
                <div>
                  <span>400</span>
                  <small>released</small>
                </div>
              </div>
              <div className="phone-rings">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>

          <div className="floating-card floating-card-right">
            <span className="floating-dot accent" />
            <strong>Timed release</strong>
            <p>Private capsules unlock exactly when the moment feels right.</p>
          </div>

          <div className="floating-card floating-card-bottom-left" id="contact">
            <span className="floating-dot warm" />
            <strong>Premium support</strong>
            <p>Full-stack orchestration across web, API, and worker services.</p>
          </div>
        </section>
      </main>
    </div>
  );
}

function AboutPage() {
  const faqItems = [
    {
      question: "How does SoulSafe protect my memories?",
      answer: "SoulSafe secures capsule content with encrypted payload workflows, token-based authentication, and protected unlock rules."
    },
    {
      question: "Can I unlock a capsule before time?",
      answer: "Yes. Locked capsules can be opened early only with the encryption key you set during capsule creation."
    },
    {
      question: "When does AI analysis run?",
      answer: "AI analysis runs right after a capsule is created so sentiment and emotion tags are available before unlock time."
    },
    {
      question: "How do I contact support?",
      answer: "Use the support details on this page or email the team directly for login, unlock, or delivery issues."
    }
  ];

  return (
    <div className="about-shell">
      <div className="about-backdrop" aria-hidden="true">
        <div className="about-glow about-glow-left" />
        <div className="about-glow about-glow-right" />
      </div>

      <header className="about-topbar">
        <Link to="/" className="welcome-brand" aria-label="SoulSafe home">
          <span className="brand-mark">S</span>
          <span className="brand-copy">
            <strong>SoulSafe</strong>
            <span>AI memory capsules</span>
          </span>
        </Link>

        <div className="about-actions">
          <Link to="/dashboard" className="btn btn-ghost">Home</Link>
          <Link to="/login" className="btn btn-primary">Login</Link>
        </div>
      </header>

      <main className="about-main">
        <section className="about-hero" id="mission">
          <p className="hero-kicker">About SoulSafe</p>
          <h1>We preserve meaningful moments and deliver them at the right emotional time.</h1>
          <p>
            SoulSafe is built to help people store private memories, letters, and media today, then unlock those capsules with AI-guided timing and secure access in the future.
          </p>
        </section>

        <section className="about-grid" id="support">
          <article className="about-card">
            <h3>Who We Are</h3>
            <p>
              We are a product team focused on emotional technology: combining secure engineering, capsule encryption, and recommendation intelligence to make future delivery meaningful.
            </p>
            <ul>
              <li>Private by default</li>
              <li>AI-powered context and sentiment guidance</li>
              <li>Unlock recommendations for preserved capsules</li>
            </ul>
          </article>

          <article className="about-card">
            <h3>Support Contact</h3>
            <p>For account access, unlock issues, or delivery concerns, contact our support team.</p>
            <div className="about-contact-list">
              <p><strong>Email:</strong> support@soulsafe.ai</p>
              <p><strong>Phone:</strong> +91-90000-00000</p>
              <p><strong>Hours:</strong> Mon-Sat, 9:00 AM to 7:00 PM IST</p>
            </div>
          </article>
        </section>

        <section className="about-faq" id="faq">
          <h3>Frequently Asked Questions</h3>
          <div className="about-faq-list">
            {faqItems.map((item) => (
              <details key={item.question} className="about-faq-item">
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function LoginPage() {
  const { login, loading, error, clearError } = useAppContext();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    try {
      await login(email, password);
      navigate("/dashboard");
    } catch {
      // Error shown from context.
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Login to continue to your SoulSafe dashboard.">
      <form className="auth-form" onSubmit={onSubmit}>
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error ? <p className="error-text">{error}</p> : null}
        <button className="btn btn-primary" disabled={loading}>{loading ? "Signing in..." : "Login"}</button>
        <div className="auth-links">
          <Link to="/forgot-password">Forgot password?</Link>
          <Link to="/register">Create account</Link>
        </div>
      </form>
    </AuthShell>
  );
}

function RegisterPage() {
  const { startRegister, verifyRegistrationOtp, loading, error, clearError } = useAppContext();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [profilePicName, setProfilePicName] = useState("");
  const [bio, setBio] = useState("");
  const [otp, setOtp] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function onStart(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setInfo(null);

    try {
      const data = await startRegister({ fullName, email, password, profilePicUrl, bio });
      setOtpStep(true);
      setEmail(data.email);
      setInfo(`OTP sent to ${data.email}. Expires in ${data.otpExpiresInMinutes} minutes.`);
    } catch {
      // Error shown from context.
    }
  }

  async function onPickProfilePic(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setProfilePicUrl(dataUrl);
    setProfilePicName(file.name);
  }

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    try {
      await verifyRegistrationOtp(email, otp);
      navigate("/dashboard");
    } catch {
      // Error shown from context.
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Register, verify your email OTP, and enter your dashboard.">
      {!otpStep ? (
        <form className="auth-form" onSubmit={onStart}>
          <label>Full name<input value={fullName} onChange={(event) => setFullName(event.target.value)} required /></label>
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} /></label>
          <label>Profile picture<input type="file" accept="image/*" onChange={onPickProfilePic} /></label>
          {profilePicName ? <p className="success-text">Selected: {profilePicName}</p> : null}
          <label>Bio<textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Tell us about yourself" /></label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="btn btn-primary" disabled={loading}>{loading ? "Creating..." : "Register"}</button>
          <div className="auth-links">
            <Link to="/login">Already have an account?</Link>
          </div>
        </form>
      ) : (
        <form className="auth-form" onSubmit={onVerify}>
          <p className="success-text">{info}</p>
          <label>Email<input value={email} disabled /></label>
          <label>Email OTP<input value={otp} onChange={(event) => setOtp(event.target.value)} required /></label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="btn btn-primary" disabled={loading}>{loading ? "Verifying..." : "Verify OTP & Continue"}</button>
        </form>
      )}
    </AuthShell>
  );
}

function ForgotPasswordPage() {
  const { requestPasswordReset, resetPassword, loading, error, clearError } = useAppContext();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  async function onRequestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    try {
      await requestPasswordReset(email);
      setOtpRequested(true);
      setInfo("If your account exists, an OTP has been sent to your email.");
    } catch {
      // Error shown from context.
    }
  }

  async function onResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    try {
      await resetPassword(email, otp, newPassword);
      navigate("/dashboard");
    } catch {
      // Error shown from context.
    }
  }

  return (
    <AuthShell title="Forgot password" subtitle="Request OTP by email, set a new password, and continue.">
      {!otpRequested ? (
        <form className="auth-form" onSubmit={onRequestOtp}>
          <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="btn btn-primary" disabled={loading}>{loading ? "Sending..." : "Send OTP"}</button>
          <div className="auth-links">
            <Link to="/login">Back to login</Link>
          </div>
        </form>
      ) : (
        <form className="auth-form" onSubmit={onResetPassword}>
          {info ? <p className="success-text">{info}</p> : null}
          <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>OTP<input value={otp} onChange={(event) => setOtp(event.target.value)} required /></label>
          <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={8} /></label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="btn btn-primary" disabled={loading}>{loading ? "Updating..." : "Update Password & Login"}</button>
          <div className="auth-links">
            <button type="button" className="inline-btn" onClick={() => setOtpRequested(false)}>Resend OTP</button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

function AuthShell({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: JSX.Element;
}) {
  const isLoginView = title.toLowerCase().includes("welcome");

  return (
    <div className="auth-shell auth-shell-pro">
      <div className="auth-backdrop" aria-hidden="true">
        <div className="auth-glow auth-glow-one" />
        <div className="auth-glow auth-glow-two" />
        <div className="auth-grid-lines" />
      </div>

      <section className="auth-modal-grid">
        <div className="auth-card auth-card-main">
          <Link to="/" className="auth-close" aria-label="Back to welcome page">×</Link>
          <p className="badge-line">SoulSafe AI</p>
          <h1>{title}</h1>
          <p>{subtitle}</p>
          {children}
        </div>

        <div className="auth-card auth-card-secondary">
          <p>{isLoginView ? "You are not a member?" : "Already have an account?"}</p>
          <Link to={isLoginView ? "/register" : "/login"} className="auth-secondary-link">
            {isLoginView ? "Register Now" : "Login Now"}
          </Link>
        </div>
      </section>
    </div>
  );
}

function DashboardLayout() {
  const { user, notifications, deleteNotification, clearNotifications, logout } = useAppContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [isDashboardNavOpen, setIsDashboardNavOpen] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const nav = [
    { label: "Dashboard", to: "/dashboard" },
    { label: "Capsule Service", to: "/dashboard/services/capsules" },
    { label: "AI Insights", to: "/dashboard/services/ai" },
    { label: "Recommendations", to: "/dashboard/services/recommendations" },
    { label: "About", to: "/about" }
  ];

  useEffect(() => {
    setIsDashboardNavOpen(false);
    setIsNotificationOpen(false);
  }, [location.pathname]);

  async function handleLogout(): Promise<void> {
    setIsDashboardNavOpen(false);
    setIsNotificationOpen(false);
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="dashboard-shell dashboard-shell-pro">
      <div className="dashboard-backdrop" aria-hidden="true">
        <div className="dashboard-backdrop-glow dashboard-glow-left" />
        <div className="dashboard-backdrop-glow dashboard-glow-right" />
        <div className="dashboard-backdrop-grid" />
        <div className="dashboard-orbit dashboard-orbit-one" />
        <div className="dashboard-orbit dashboard-orbit-two" />
      </div>

      <main className="dashboard-main">
        <header className="dashboard-topbar">
          <Link to="/dashboard" className="dashboard-brand" aria-label="SoulSafe dashboard home">
            <span className="brand-mark">S</span>
            <span className="brand-copy">
              <strong>SoulSafe</strong>
              <span>Secure memory</span>
            </span>
          </Link>

          <nav className="dashboard-nav" aria-label="Dashboard navigation">
            {nav.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={location.pathname === item.to ? "dashboard-nav-link active" : "dashboard-nav-link"}
                onClick={() => setIsDashboardNavOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="dashboard-actions">
            <button
              type="button"
              className="dashboard-menu-toggle"
              aria-label="Toggle dashboard navigation"
              aria-expanded={isDashboardNavOpen ? "true" : "false"}
              onClick={() => {
                setIsDashboardNavOpen((current) => !current);
                setIsNotificationOpen(false);
              }}
            >
              <span />
              <span />
              <span />
            </button>

            <div className="dashboard-notification-wrap">
              <button
                type="button"
                className="dashboard-notification-btn"
                aria-label="Open notifications"
                aria-expanded={isNotificationOpen ? "true" : "false"}
                onClick={() => {
                  setIsNotificationOpen((current) => !current);
                  setIsDashboardNavOpen(false);
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" className="dashboard-notification-icon">
                  <path
                    d="M12 4a4 4 0 0 0-4 4v1.6c0 1.3-.5 2.6-1.4 3.5l-1.2 1.2c-.6.6-.2 1.7.7 1.7h12c.9 0 1.3-1.1.7-1.7l-1.2-1.2A4.9 4.9 0 0 1 16 9.6V8a4 4 0 0 0-4-4Zm0 16a2.5 2.5 0 0 0 2.3-1.5.8.8 0 0 0-.7-1.1h-3.2a.8.8 0 0 0-.7 1.1A2.5 2.5 0 0 0 12 20Z"
                    fill="currentColor"
                  />
                </svg>
                {notifications.length ? <span className="dashboard-notification-badge">{notifications.length > 9 ? "9+" : notifications.length}</span> : null}
              </button>

              {isNotificationOpen ? (
                <div className="dashboard-notification-panel" role="status" aria-live="polite">
                  <div className="dashboard-notification-panel-head">
                    <h3>Alerts & Notifications</h3>
                    {notifications.length ? (
                      <button type="button" className="dashboard-notification-clear" onClick={clearNotifications}>
                        Clear all
                      </button>
                    ) : null}
                  </div>
                  <ul>
                    {notifications.length ? (
                      notifications.map((notification) => (
                        <li key={notification.id} className={notification.kind === "opened" ? "notification-opened" : "notification-created"}>
                          <span>{notification.message}</span>
                          <button type="button" className="dashboard-notification-delete" aria-label={`Delete notification: ${notification.message}`} onClick={() => deleteNotification(notification.id)}>
                            ×
                          </button>
                        </li>
                      ))
                    ) : (
                      <li className="notification-empty">No notifications yet.</li>
                    )}
                  </ul>
                </div>
              ) : null}
            </div>

            <Link to="/dashboard/profile" className="dashboard-user-chip" aria-label="Open profile page">
              {user?.profilePicUrl ? <img src={user.profilePicUrl} alt={user.fullName || "User"} className="avatar avatar-small" /> : <span className="avatar-fallback">{(user?.fullName || user?.email || "U").slice(0, 1).toUpperCase()}</span>}
              <span>{user?.fullName || user?.email || "User"}</span>
            </Link>
            <button type="button" className="btn btn-ghost dashboard-logout" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </header>

        {isDashboardNavOpen ? (
          <aside className="dashboard-mobile-menu" aria-label="Dashboard mobile menu">
            <nav className="dashboard-mobile-nav">
              {nav.map((item) => (
                <Link
                  key={`mobile-${item.to}`}
                  to={item.to}
                  className={location.pathname === item.to ? "dashboard-nav-link active" : "dashboard-nav-link"}
                  onClick={() => setIsDashboardNavOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="dashboard-mobile-account">
              <Link to="/dashboard/profile" className="dashboard-user-chip" aria-label="Open profile page" onClick={() => setIsDashboardNavOpen(false)}>
                {user?.profilePicUrl ? <img src={user.profilePicUrl} alt={user.fullName || "User"} className="avatar avatar-small" /> : <span className="avatar-fallback">{(user?.fullName || user?.email || "U").slice(0, 1).toUpperCase()}</span>}
                <span>{user?.fullName || user?.email || "User"}</span>
              </Link>

              <button type="button" className="btn btn-ghost dashboard-logout" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </aside>
        ) : null}

        <Outlet />
      </main>
    </div>
  );
}

function DashboardHomePage() {
  const { capsules } = useAppContext();
  const [searchQuery, setSearchQuery] = useState("");
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredCapsules = useMemo(() => {
    if (!normalizedQuery) {
      return capsules;
    }

    return capsules.filter((capsule) => {
      const searchable = [
        capsule.title,
        capsule.body || "",
        capsule.status,
        capsule.unlockAt || "",
        capsule.emotionLabels?.join(" ") || ""
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(normalizedQuery);
    });
  }, [capsules, normalizedQuery]);

  const released = capsules.filter((item) => item.status === "released").length;
  const locked = capsules.filter((item) => item.status === "locked").length;
  const activitySeries = useMemo(() => {
    const bucketCount = 12;
    const windowMs = 24 * 60 * 60 * 1000;
    const bucketSizeMs = windowMs / bucketCount;
    const windowStart = Date.now() - windowMs;

    const buckets = Array.from({ length: bucketCount }, (_, index) => {
      const bucketStart = new Date(windowStart + index * bucketSizeMs);
      const bucketEnd = new Date(windowStart + (index + 1) * bucketSizeMs);

      return {
        label: `${bucketStart.getHours().toString().padStart(2, "0")}:00`,
        range: `${bucketStart.getHours().toString().padStart(2, "0")}:00 - ${bucketEnd.getHours().toString().padStart(2, "0")}:00`,
        count: 0
      };
    });

    for (const capsule of capsules) {
      const createdAt = new Date(capsule.createdAt).getTime();
      if (Number.isNaN(createdAt) || createdAt < windowStart) {
        continue;
      }

      const bucketIndex = Math.min(bucketCount - 1, Math.floor((createdAt - windowStart) / bucketSizeMs));
      buckets[bucketIndex].count += 1;
    }

    const peakCount = Math.max(1, ...buckets.map((bucket) => bucket.count));

    return {
      total: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
      peak: peakCount,
      bars: buckets.map((bucket) => ({
        ...bucket,
        height: bucket.count ? Math.max(18, (bucket.count / peakCount) * 100) : 8
      }))
    };
  }, [capsules]);

  return (
    <section className="dashboard-home">
      <div className="dashboard-hero-card">
        <div className="dashboard-hero-copy">
          <p className="hero-kicker">SoulSafe dashboard</p>
          <h1>Welcome.</h1>
          <p className="hero-description">
            Private capsules, timed release, and AI-guided memory analysis in a single cinematic control surface.
          </p>

          <label className="dashboard-searchbar" aria-label="Search capsule vault">
            <span className="dashboard-search-icon" aria-hidden="true">⌕</span>
            <input
              className="dashboard-search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search capsules, releases, and alerts"
            />
            {searchQuery ? (
              <button type="button" className="dashboard-search-clear" aria-label="Clear search" onClick={() => setSearchQuery("")}>
                ×
              </button>
            ) : null}
          </label>

          <p className="dashboard-search-help">{filteredCapsules.length} matching capsule{filteredCapsules.length === 1 ? "" : "s"}</p>

          <div className="hero-cta-row dashboard-cta-row">
            <Link to="/dashboard/services/capsules" className="store-btn store-btn-primary dashboard-cta-btn">
              <span className="store-icon" aria-hidden="true">+</span>
              <span>
                <strong>Create capsule</strong>
                <small>Store a future message</small>
              </span>
            </Link>
            <Link to="/dashboard/services/ai" className="store-btn store-btn-secondary dashboard-cta-btn">
              <span className="store-icon" aria-hidden="true">✦</span>
              <span>
                <strong>Open AI insights</strong>
                <small>Review sentiment and prompts</small>
              </span>
            </Link>
          </div>

          <div className="dashboard-mini-stats">
            <article>
              <span>Total</span>
              <strong>{capsules.length}</strong>
            </article>
            <article>
              <span>Locked</span>
              <strong>{locked}</strong>
            </article>
            <article>
              <span>Released</span>
              <strong>{released}</strong>
            </article>
          </div>
        </div>

        <div className="dashboard-hero-visual" aria-label="Abstract dashboard illustration">
          <div className="dashboard-hero-card-shell">
            <div className="dashboard-hero-card-top">
              <span>Landing page</span>
              <span className="status-chip">Live</span>
            </div>

            <div className="dashboard-wave-stage">
              <span className="dashboard-wave dashboard-wave-one" />
              <span className="dashboard-wave dashboard-wave-two" />
              <span className="dashboard-wave dashboard-wave-three" />
              <div className="dashboard-core-orb" />
            </div>

            <div className="dashboard-hero-metrics">
              <div>
                <span>Encrypted</span>
                <strong>870</strong>
              </div>
              <div>
                <span>Released</span>
                <strong>400</strong>
              </div>
            </div>

            <div className="dashboard-hero-note">
              <p>Timed release, secure delivery, and emotional context rendered with a warm dark theme.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid dashboard-grid-pro">
        <div className="metric-card">
          <p>Total Capsules</p>
          <strong>{capsules.length}</strong>
        </div>
        <div className="metric-card">
          <p>Locked Capsules</p>
          <strong>{locked}</strong>
        </div>
        <div className="metric-card">
          <p>Released Capsules</p>
          <strong>{released}</strong>
        </div>
        <div className="metric-card">
          <p>Service Health</p>
          <strong>Operational</strong>
        </div>

        <div className="wide-card">
          <h3>Activity Overview</h3>
          <p className="activity-overview-copy">Capsules created in the last 24 hours.</p>
          <div className="activity-overview-card">
            <div className="activity-overview-meta">
              <div>
                <span>Last 24h</span>
                <strong>{activitySeries.total}</strong>
              </div>
              <div>
                <span>Peak bucket</span>
                <strong>{activitySeries.peak}</strong>
              </div>
            </div>

            <div className="activity-chart" aria-label="Capsule activity chart for the last 24 hours">
              {activitySeries.bars.map((bar) => (
                <div key={bar.range} className="activity-chart-bar" title={`${bar.range}: ${bar.count} capsule${bar.count === 1 ? "" : "s"}`}>
                  <div className="activity-chart-track">
                    <div className={`activity-chart-fill ${heightClass(bar.height)}`} />
                  </div>
                  <span className="activity-chart-count">{bar.count}</span>
                  <span className="activity-chart-label">{bar.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="wide-card">
          <h3>Recent Capsule Status</h3>
          <ul className="status-list">
            {filteredCapsules.slice(0, 6).map((capsule) => (
              <li key={capsule.id}>
                <span>{capsule.title}</span>
                <span className={`pill ${capsule.status}`}>{capsule.status}</span>
              </li>
            ))}
            {!filteredCapsules.length ? <li>{searchQuery ? "No matching capsules." : "No capsules yet."}</li> : null}
          </ul>
        </div>
      </div>
    </section>
  );
}

function CapsuleServicePage() {
  const {
    capsules,
    createCapsule,
    deleteCapsule,
    loading,
    error,
    clearError
  } = useAppContext();
  const [title, setTitle] = useState("Message to my future self");
  const [body, setBody] = useState("I hope you stayed brave.");
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaName, setMediaName] = useState("");
  const [unlockMode, setUnlockMode] = useState<"date" | "event">("date");
  const [unlockAt, setUnlockAt] = useState(() => toLocalDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [eventType, setEventType] = useState<UnlockEventRule["type"]>("birthday");
  const [eventDate, setEventDate] = useState(() => toLocalDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
  const [eventName, setEventName] = useState("");
  const [personName, setPersonName] = useState("");
  const [unlockKey, setUnlockKey] = useState("");

  async function onPickMedia(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setMediaUrl(dataUrl);
    setMediaName(file.name);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();

    const eventRule = unlockMode === "event"
      ? {
          type: eventType,
          date: eventDate ? new Date(eventDate).toISOString() : undefined,
          metadata: {
            eventName: eventName || undefined,
            personName: personName || undefined
          }
        }
      : undefined;

    await createCapsule({
      title,
      body,
      mediaUrl: mediaUrl || undefined,
      unlockAt: unlockMode === "date" ? (unlockAt ? new Date(unlockAt).toISOString() : undefined) : undefined,
      unlockEventRules: eventRule,
      unlockKey
    });
    setBody("");
    setMediaUrl("");
    setMediaName("");
    setUnlockAt(toLocalDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    setEventDate(toLocalDateTimeValue(new Date(Date.now() + 24 * 60 * 60 * 1000)));
    setEventName("");
    setPersonName("");
    setUnlockKey("");
  }

  async function onDeleteCapsule(capsuleId: string, capsuleTitle: string): Promise<void> {
    if (!window.confirm(`Delete capsule \"${capsuleTitle}\"? This cannot be undone.`)) {
      return;
    }

    clearError();
    try {
      await deleteCapsule(capsuleId);
    } catch {
      // Error shown from context.
    }
  }

  return (
    <section className="service-page capsule-service-page">
      <h3>Capsule Service</h3>
      <p>Create a capsule here, then let the AI analysis run immediately after save. You will receive an email when the capsule is created, when analysis is ready, and when it opens.</p>

      <form className="panel-form capsule-form" onSubmit={onSubmit}>
        <div className="capsule-form-grid">
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>
          <label>
            Unlock mode
            <select value={unlockMode} onChange={(event) => setUnlockMode(event.target.value as "date" | "event")}>
              <option value="date">Date-based</option>
              <option value="event">Event-based</option>
            </select>
          </label>
          <label>
            Unlock day and time
            <input
              type="datetime-local"
              value={unlockAt}
              onChange={(event) => setUnlockAt(event.target.value)}
              required={unlockMode === "date"}
              disabled={unlockMode !== "date"}
            />
          </label>
          <label>
            Event type
            <select value={eventType} onChange={(event) => setEventType(event.target.value as UnlockEventRule["type"])} disabled={unlockMode !== "event"}>
              <option value="birthday">Birthday</option>
              <option value="exam">Exam</option>
              <option value="breakup">Breakup</option>
              <option value="custom">Custom</option>
            </select>
          </label>
          <label>
            Event date
            <input
              type="datetime-local"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              required={unlockMode === "event"}
              disabled={unlockMode !== "event"}
            />
          </label>
          <label>
            Event name
            <input
              value={eventName}
              onChange={(event) => setEventName(event.target.value)}
              placeholder="e.g. Final Exam or Her Birthday"
              disabled={unlockMode !== "event"}
            />
          </label>
          <label>
            Person name
            <input
              value={personName}
              onChange={(event) => setPersonName(event.target.value)}
              placeholder="Optional"
              disabled={unlockMode !== "event"}
            />
          </label>
          <label>
            Media
            <input type="file" accept="image/*,video/*,audio/*" onChange={onPickMedia} />
          </label>
          <label>
            Encryption key
            <input value={unlockKey} onChange={(event) => setUnlockKey(event.target.value)} required minLength={6} />
          </label>
        </div>

        {mediaName ? <p className="success-text">Selected media: {mediaName}</p> : null}

        <label className="capsule-body-field">
          Body
          <textarea value={body} onChange={(event) => setBody(event.target.value)} required placeholder="Write the memory you want stored in the capsule" />
        </label>

        <p className="capsule-analysis-note">Sentiment and content analysis will be performed automatically on the body after creation.</p>

        <button className="btn btn-primary" disabled={loading || !title || !body || !unlockKey}>{loading ? "Saving..." : "Create Capsule"}</button>
      </form>

      {error ? <p className="error-text">{error}</p> : null}

      <div className="table-card">
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Media</th>
              <th>Status</th>
              <th>Unlock</th>
              <th>AI</th>
              <th>Emotion</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {capsules.map((capsule) => (
              <tr key={capsule.id}>
                <td>{capsule.title}</td>
                <td>{capsule.mediaUrl ? "Attached" : "-"}</td>
                <td><span className={`pill ${capsule.status}`}>{capsule.status}</span></td>
                <td>{capsule.unlockAt || "-"}</td>
                <td>{typeof capsule.sentimentScore === "number" ? capsule.sentimentScore.toFixed(2) : "Pending"}</td>
                <td>{capsule.emotionLabels?.length ? capsule.emotionLabels.join(", ") : "Pending"}</td>
                <td>
                  <div className="capsule-row-actions">
                    <Link to={`/dashboard/services/capsules/${capsule.id}`} className="btn btn-primary capsule-detail-link">
                      View
                    </Link>
                    <button
                      type="button"
                      className="inline-btn"
                      onClick={() => onDeleteCapsule(capsule.id, capsule.title)}
                      disabled={loading}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CapsuleDetailPage() {
  const { capsuleId } = useParams<{ capsuleId: string }>();
  const navigate = useNavigate();
  const { capsules, token, unlockCapsuleWithKey, deleteCapsule, loading, error, clearError } = useAppContext();
  const [unlockKey, setUnlockKey] = useState("");
  const [unlockSuccess, setUnlockSuccess] = useState(false);
  const [unlockReason, setUnlockReason] = useState<string | null>(null);
  const capsule = capsules.find((item) => item.id === capsuleId);

  useEffect(() => {
    if (!token || !capsuleId) {
      return;
    }

    request<Capsule & { unlockReason?: string; capsule?: Capsule }>(`/capsules/${capsuleId}`, {}, token)
      .then((payload) => {
        const reason = payload.unlockReason || null;
        setUnlockReason(reason);
      })
      .catch(() => {
        setUnlockReason(null);
      });
  }, [token, capsuleId, capsules]);

  async function onUnlockWithKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!capsule) {
      return;
    }

    clearError();
    setUnlockSuccess(false);

    try {
      await unlockCapsuleWithKey(capsule.id, unlockKey);
      setUnlockKey("");
      setUnlockSuccess(true);
    } catch {
      // Error shown from context.
    }
  }

  async function onDeleteCapsule(): Promise<void> {
    if (!capsule) {
      return;
    }

    if (!window.confirm(`Delete capsule \"${capsule.title}\"? This cannot be undone.`)) {
      return;
    }

    clearError();
    try {
      await deleteCapsule(capsule.id);
      navigate("/dashboard/services/capsules", { replace: true });
    } catch {
      // Error shown from context.
    }
  }

  if (!capsule) {
    return (
      <section className="service-page capsule-detail-page">
        <div className="capsule-detail-header">
          <h3>Capsule Details</h3>
          <Link to="/dashboard/services/capsules" className="btn btn-primary capsule-detail-back">Back to Capsule Service</Link>
        </div>
        <div className="capsule-detail-card">
          <p>Capsule not found. It may have been removed or is still loading.</p>
        </div>
      </section>
    );
  }

  const isReleased = capsule.status === "released";

  return (
    <section className="service-page capsule-detail-page">
      <div className="capsule-detail-header">
        <div>
          <h3>{capsule.title}</h3>
          <p>Complete capsule details and AI analysis summary.</p>
        </div>
        <div className="capsule-detail-actions">
          <button type="button" className="inline-btn" onClick={onDeleteCapsule} disabled={loading}>
            Delete Capsule
          </button>
          <Link to="/dashboard/services/capsules" className="btn btn-primary capsule-detail-back">Back to Capsule Service</Link>
        </div>
      </div>

      <div className="capsule-detail-grid">
        <article className="capsule-detail-card">
          <h4>Core Details</h4>
          <dl>
            <div>
              <dt>Status</dt>
              <dd><span className={`pill ${capsule.status}`}>{capsule.status}</span></dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{new Date(capsule.createdAt).toLocaleString()}</dd>
            </div>
            <div>
              <dt>Unlock Time</dt>
              <dd>{capsule.unlockAt ? new Date(capsule.unlockAt).toLocaleString() : "Not scheduled"}</dd>
            </div>
            <div>
              <dt>Event Trigger</dt>
              <dd>{capsule.unlockEventRules ? `${capsule.unlockEventRules.type}${capsule.unlockEventRules.metadata?.eventName ? ` (${capsule.unlockEventRules.metadata.eventName})` : ""}` : "None"}</dd>
            </div>
          </dl>
        </article>

        <article className="capsule-detail-card">
          <h4>AI Analysis</h4>
          <dl>
            <div>
              <dt>Sentiment Score</dt>
              <dd>{typeof capsule.sentimentScore === "number" ? capsule.sentimentScore.toFixed(2) : "Pending"}</dd>
            </div>
            <div>
              <dt>Emotion Labels</dt>
              <dd>{capsule.emotionLabels?.length ? capsule.emotionLabels.join(", ") : "Pending"}</dd>
            </div>
            <div>
              <dt>Context Signal</dt>
              <dd>{capsule.emotionLabels?.length ? "Emotional context inferred for unlock relevance." : "Awaiting context tagging."}</dd>
            </div>
          </dl>
        </article>
      </div>

      <article className="capsule-detail-card capsule-content-card">
        <h4>Locked Content</h4>
        {isReleased ? (
          <>
            <div className="capsule-content-block">
              <h5>Body</h5>
              <p>{capsule.body || "No body content found."}</p>
            </div>

            <div className="capsule-content-block">
              <h5>Media</h5>
              {capsule.mediaUrl ? (
                capsule.mediaUrl.startsWith("data:image") ? (
                  <img src={capsule.mediaUrl} alt={capsule.title} className="capsule-detail-media" />
                ) : capsule.mediaUrl.startsWith("data:video") ? (
                  <video src={capsule.mediaUrl} controls className="capsule-detail-media" />
                ) : capsule.mediaUrl.startsWith("data:audio") ? (
                  <audio src={capsule.mediaUrl} controls className="capsule-detail-audio" />
                ) : (
                  <a href={capsule.mediaUrl} target="_blank" rel="noreferrer" className="inline-btn">Open media</a>
                )
              ) : (
                <p>No media attached.</p>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="capsule-locked-hint">Body and media are hidden until this capsule is unlocked.</p>
            <form className="capsule-unlock-form" onSubmit={onUnlockWithKey}>
              <label>
                Enter capsule encryption key
                <input
                  type="password"
                  value={unlockKey}
                  onChange={(event) => setUnlockKey(event.target.value)}
                  required
                  minLength={6}
                  placeholder="Enter the same key used during creation"
                />
              </label>
              <button className="btn btn-primary" disabled={loading || !unlockKey}>
                {loading ? "Unlocking..." : "Unlock Capsule"}
              </button>
            </form>
            {unlockSuccess ? <p className="success-text">Capsule unlocked successfully.</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
          </>
        )}
      </article>

      <article className="capsule-detail-card">
        <h4>Why you're seeing this</h4>
        <p>{unlockReason || "This capsule has not been unlocked by recommendation flow yet."}</p>
      </article>
    </section>
  );
}

function AiServicePage() {
  const { capsules, token, user } = useAppContext();
  const [timeline, setTimeline] = useState<EmotionTimelinePoint[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "locked" | "released">("all");
  const [sentimentFilter, setSentimentFilter] = useState<"all" | "positive" | "neutral" | "negative" | "pending">("all");

  const filteredCapsules = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return capsules.filter((capsule) => {
      const matchesQuery =
        !normalizedQuery ||
        [capsule.title, capsule.emotionLabels?.join(" ") || "", capsule.status]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      const matchesStatus = statusFilter === "all" || capsule.status === statusFilter;

      const score = capsule.sentimentScore;
      const sentimentBand =
        typeof score !== "number"
          ? "pending"
          : score >= 0.2
            ? "positive"
            : score <= -0.2
              ? "negative"
              : "neutral";

      const matchesSentiment = sentimentFilter === "all" || sentimentBand === sentimentFilter;

      return matchesQuery && matchesStatus && matchesSentiment;
    });
  }, [capsules, query, statusFilter, sentimentFilter]);

  const sentimentStats = useMemo(() => {
    let positive = 0;
    let neutral = 0;
    let negative = 0;
    let pending = 0;
    let sentimentSum = 0;
    let sentimentCount = 0;

    for (const capsule of filteredCapsules) {
      if (typeof capsule.sentimentScore !== "number") {
        pending += 1;
        continue;
      }

      sentimentSum += capsule.sentimentScore;
      sentimentCount += 1;

      if (capsule.sentimentScore >= 0.2) {
        positive += 1;
      } else if (capsule.sentimentScore <= -0.2) {
        negative += 1;
      } else {
        neutral += 1;
      }
    }

    const average = sentimentCount ? sentimentSum / sentimentCount : 0;

    return {
      positive,
      neutral,
      negative,
      pending,
      average: average.toFixed(2)
    };
  }, [filteredCapsules]);

  useEffect(() => {
    if (!token || !user?.id) {
      return;
    }

    setTimelineLoading(true);
    request<EmotionTimelinePoint[]>(`/ai/timeline/${user.id}`, {}, token)
      .then((points) => setTimeline(points))
      .catch(() => setTimeline([]))
      .finally(() => setTimelineLoading(false));
  }, [token, user?.id, capsules.length]);

  const topEmotions = useMemo(() => {
    const counts = new Map<string, number>();

    for (const capsule of filteredCapsules) {
      for (const emotion of capsule.emotionLabels || []) {
        const key = emotion.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([emotion, count]) => ({
        emotion: emotion.charAt(0).toUpperCase() + emotion.slice(1),
        count
      }));
  }, [filteredCapsules]);

  const trendData = useMemo(() => {
    return [...filteredCapsules]
      .filter((capsule) => typeof capsule.sentimentScore === "number")
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
      .slice(-10)
      .map((capsule) => ({
        label: capsule.title,
        sentimentScore: capsule.sentimentScore as number
      }));
  }, [filteredCapsules]);

  const trendPath = useMemo(() => {
    if (!trendData.length) {
      return "";
    }

    const width = 100;
    const height = 40;

    return trendData
      .map((item, index) => {
        const x = trendData.length === 1 ? width / 2 : (index / (trendData.length - 1)) * width;
        const normalized = (item.sentimentScore + 1) / 2;
        const y = height - normalized * height;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [trendData]);

  const maxSentimentBucket = Math.max(
    1,
    sentimentStats.positive,
    sentimentStats.neutral,
    sentimentStats.negative,
    sentimentStats.pending
  );

  const sentimentBars = [
    { key: "Positive", value: sentimentStats.positive, tone: "positive" },
    { key: "Neutral", value: sentimentStats.neutral, tone: "neutral" },
    { key: "Negative", value: sentimentStats.negative, tone: "negative" },
    { key: "Pending", value: sentimentStats.pending, tone: "pending" }
  ];

  return (
    <section className="service-page ai-service-page">
      <div className="ai-topbar">
        <div>
          <h3>AI Insights Service</h3>
          <p>Emotion signals, sentiment trend scoring, and context-driven overview for capsule intelligence.</p>
        </div>
        <Link to="/dashboard/services/capsules" className="store-btn store-btn-primary ai-create-btn">
          <span className="store-icon" aria-hidden="true">+</span>
          <span>
            <strong>Create capsule</strong>
            <small>Feed new analysis</small>
          </span>
        </Link>
      </div>

      <div className="ai-controls">
        <label className="ai-search-control">
          <span>Search</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title, emotion, status" />
        </label>

        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "draft" | "locked" | "released")}>
            <option value="all">All</option>
            <option value="draft">Draft</option>
            <option value="locked">Locked</option>
            <option value="released">Released</option>
          </select>
        </label>

        <label>
          <span>Sentiment</span>
          <select value={sentimentFilter} onChange={(event) => setSentimentFilter(event.target.value as "all" | "positive" | "neutral" | "negative" | "pending")}>
            <option value="all">All</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
            <option value="pending">Pending</option>
          </select>
        </label>
      </div>

      <div className="ai-kpi-grid">
        <article className="ai-kpi-card">
          <span>Total In Scope</span>
          <strong>{filteredCapsules.length}</strong>
        </article>
        <article className="ai-kpi-card">
          <span>Avg Sentiment</span>
          <strong>{sentimentStats.average}</strong>
        </article>
        <article className="ai-kpi-card">
          <span>Positive Signals</span>
          <strong>{sentimentStats.positive}</strong>
        </article>
        <article className="ai-kpi-card">
          <span>Pending Analysis</span>
          <strong>{sentimentStats.pending}</strong>
        </article>
      </div>

      <div className="ai-grid">
        {timelineLoading ? (
          <article className="ai-card ai-trend-card">
            <p className="capsule-analysis-note">Loading timeline...</p>
          </article>
        ) : (
          <EmotionTimeline data={timeline} />
        )}

        <article className="ai-card ai-trend-card">
          <div className="ai-card-head">
            <h4>Sentiment Trend</h4>
            <span>{trendData.length} recent points</span>
          </div>
          {trendPath ? (
            <svg viewBox="0 0 100 40" className="ai-trend-svg" preserveAspectRatio="none" role="img" aria-label="Sentiment trend line">
              <polyline points={trendPath} className="ai-trend-line" />
            </svg>
          ) : (
            <p className="capsule-analysis-note">Trend appears after sentiment scores are generated.</p>
          )}
        </article>

        <article className="ai-card ai-bars-card">
          <div className="ai-card-head">
            <h4>Sentiment Distribution</h4>
            <span>By capsule count</span>
          </div>
          <div className="ai-bars">
            {sentimentBars.map((bar) => (
              <div key={bar.key} className="ai-bar-item">
                <div className="ai-bar-track">
                  <span className={`ai-bar-fill ${bar.tone} ${heightClass((bar.value / maxSentimentBucket) * 100)}`} />
                </div>
                <strong>{bar.value}</strong>
                <small>{bar.key}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="ai-card ai-emotion-card">
          <div className="ai-card-head">
            <h4>Top Emotions</h4>
            <span>Context tags</span>
          </div>
          <ul className="ai-emotion-list">
            {topEmotions.length ? (
              topEmotions.map((item) => (
                <li key={item.emotion}>
                  <span>{item.emotion}</span>
                  <strong>{item.count}</strong>
                </li>
              ))
            ) : (
              <li>
                <span>No emotions yet</span>
                <strong>0</strong>
              </li>
            )}
          </ul>
        </article>

        <article className="ai-card ai-table-card">
          <div className="ai-card-head">
            <h4>Capsule Analysis Feed</h4>
            <span>{filteredCapsules.length} rows</span>
          </div>
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>Capsule</th>
                  <th>Status</th>
                  <th>Sentiment</th>
                  <th>Emotions</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filteredCapsules.map((capsule) => (
                  <tr key={capsule.id}>
                    <td>{capsule.title}</td>
                    <td><span className={`pill ${capsule.status}`}>{capsule.status}</span></td>
                    <td>{typeof capsule.sentimentScore === "number" ? capsule.sentimentScore.toFixed(2) : "Pending"}</td>
                    <td>{capsule.emotionLabels?.length ? capsule.emotionLabels.join(", ") : "Pending"}</td>
                    <td>
                      <Link to={`/dashboard/services/capsules/${capsule.id}`} className="inline-btn">Open</Link>
                    </td>
                  </tr>
                ))}
                {!filteredCapsules.length ? (
                  <tr>
                    <td colSpan={5}>No records match current filters.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  );
}

function RecommendationServicePage() {
  const { capsules } = useAppContext();
  const [viewMode, setViewMode] = useState<"all" | "ideas" | "unlock">("all");

  const lockedCapsules = useMemo(() => capsules.filter((capsule) => capsule.status === "locked"), [capsules]);

  const topEmotion = useMemo(() => {
    const counts = new Map<string, number>();

    for (const capsule of capsules) {
      for (const emotion of capsule.emotionLabels || []) {
        const key = emotion.toLowerCase();
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }

    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return top ? top[0] : "reflection";
  }, [capsules]);

  const creationIdeas = useMemo(() => {
    const templates = [
      {
        title: "Letter to Future Calm",
        prompt: "Write a grounding message for your future self on a difficult day.",
        tag: "Emotional support"
      },
      {
        title: "Milestone Snapshot",
        prompt: "Capture your current win, lesson, and one promise for the next chapter.",
        tag: "Growth journal"
      },
      {
        title: "Voice of Gratitude",
        prompt: "Record gratitude moments with media and a short note to revisit later.",
        tag: "Memory preserve"
      }
    ];

    return templates.map((item, index) => ({
      ...item,
      hint: index === 0 ? `Current dominant emotion theme: ${topEmotion}` : "Align unlock date with a meaningful future moment."
    }));
  }, [topEmotion]);

  const unlockRecommendations = useMemo(() => {
    const now = Date.now();

    return lockedCapsules
      .map((capsule) => {
        const unlockAtMs = capsule.unlockAt ? Date.parse(capsule.unlockAt) : NaN;
        const score = typeof capsule.sentimentScore === "number" ? capsule.sentimentScore : 0;
        const hoursLeft = Number.isNaN(unlockAtMs) ? null : (unlockAtMs - now) / (1000 * 60 * 60);

        let urgency = "Planned";
        let suggestion = "Keep this capsule preserved until its scheduled unlock for stronger emotional impact.";

        if (hoursLeft !== null && hoursLeft <= 0) {
          urgency = "Ready";
          suggestion = "This capsule has reached unlock time. Open it now from details.";
        } else if (hoursLeft !== null && hoursLeft <= 24) {
          urgency = "Soon";
          suggestion = "Unlock window is within 24 hours. Prepare to review this memory soon.";
        } else if (score <= -0.25) {
          urgency = "Sensitive";
          suggestion = "Sentiment indicates emotional weight. Consider unlocking in a calm setting.";
        }

        return {
          id: capsule.id,
          title: capsule.title,
          unlockAt: capsule.unlockAt,
          urgency,
          suggestion
        };
      })
      .sort((a, b) => {
        const rank = (value: string) => {
          if (value === "Ready") return 0;
          if (value === "Soon") return 1;
          if (value === "Sensitive") return 2;
          return 3;
        };

        return rank(a.urgency) - rank(b.urgency);
      });
  }, [lockedCapsules]);

  const visibleIdeas = viewMode === "unlock" ? [] : creationIdeas;
  const visibleUnlocks = viewMode === "ideas" ? [] : unlockRecommendations;

  return (
    <section className="service-page recommendation-page">
      <div className="recommendation-topbar">
        <div>
          <h3>Recommendations & Suggestions</h3>
          <p>Get smart ideas for creating new capsules and contextual suggestions for unlocking preserved capsules.</p>
        </div>
        <div className="recommendation-actions">
          <button type="button" className={viewMode === "all" ? "inline-btn active" : "inline-btn"} onClick={() => setViewMode("all")}>All</button>
          <button type="button" className={viewMode === "ideas" ? "inline-btn active" : "inline-btn"} onClick={() => setViewMode("ideas")}>Create Ideas</button>
          <button type="button" className={viewMode === "unlock" ? "inline-btn active" : "inline-btn"} onClick={() => setViewMode("unlock")}>Unlock Advice</button>
        </div>
      </div>

      <div className="recommendation-grid">
        <article className="recommendation-card recommendation-ideas">
          <div className="recommendation-head">
            <h4>New Capsule Ideas</h4>
            <Link to="/dashboard/services/capsules" className="store-btn store-btn-primary recommendation-create-btn">
              <span className="store-icon" aria-hidden="true">+</span>
              <span>
                <strong>Create capsule</strong>
                <small>Use an idea</small>
              </span>
            </Link>
          </div>

          <ul className="recommendation-list">
            {visibleIdeas.map((idea) => (
              <li key={idea.title}>
                <div>
                  <strong>{idea.title}</strong>
                  <p>{idea.prompt}</p>
                  <small>{idea.hint}</small>
                </div>
                <span className="recommendation-tag">{idea.tag}</span>
              </li>
            ))}
            {!visibleIdeas.length ? <li className="recommendation-empty">Create suggestions hidden by filter.</li> : null}
          </ul>
        </article>

        <article className="recommendation-card recommendation-unlock">
          <div className="recommendation-head">
            <h4>Unlock Recommendations</h4>
            <span>{lockedCapsules.length} preserved capsule{lockedCapsules.length === 1 ? "" : "s"}</span>
          </div>

          <ul className="recommendation-list">
            {visibleUnlocks.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.suggestion}</p>
                  <small>{item.unlockAt ? `Unlock at ${new Date(item.unlockAt).toLocaleString()}` : "No unlock date set"}</small>
                </div>
                <div className="recommendation-cta">
                  <span className={`recommendation-tag recommendation-${item.urgency.toLowerCase()}`}>{item.urgency}</span>
                  <Link to={`/dashboard/services/capsules/${item.id}`} className="inline-btn">Open</Link>
                </div>
              </li>
            ))}
            {!visibleUnlocks.length ? <li className="recommendation-empty">Unlock recommendations hidden by filter.</li> : null}
          </ul>
        </article>
      </div>
    </section>
  );
}

function ProfilePage() {
  const { user, updateProfile, loading, error, clearError } = useAppContext();
  const [displayName, setDisplayName] = useState(user?.fullName || "SoulSafe User");
  const [timezone, setTimezone] = useState(localStorage.getItem("soulsafe_timezone") || "Asia/Kolkata");
  const [bio, setBio] = useState(user?.bio || "");
  const [profilePicUrl, setProfilePicUrl] = useState(user?.profilePicUrl || "");
  const [profilePicName, setProfilePicName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDisplayName(user?.fullName || "SoulSafe User");
    setBio(user?.bio || "");
    setProfilePicUrl(user?.profilePicUrl || "");
  }, [user]);

  async function onPickProfilePic(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setProfilePicUrl(dataUrl);
    setProfilePicName(file.name);
    setSaved(false);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearError();
    setSaved(false);

    try {
      await updateProfile({
        fullName: displayName.trim() || "SoulSafe User",
        profilePicUrl: profilePicUrl || undefined,
        bio: bio.trim() || undefined
      });
      localStorage.setItem("soulsafe_display_name", displayName);
      localStorage.setItem("soulsafe_timezone", timezone);
      setSaved(true);
    } catch {
      // Error shown from context.
    }
  }

  return (
    <section className="service-page profile-page">
      <div className="profile-page-header">
        <div>
          <p className="hero-kicker">Dashboard profile</p>
          <h3>User Profile Management</h3>
          <p>Update your avatar, public display name, bio, and local preferences.</p>
        </div>
        <div className="profile-avatar-panel">
          {profilePicUrl ? <img src={profilePicUrl} alt={displayName} className="profile-avatar" /> : <span className="profile-avatar profile-avatar-fallback">{displayName.slice(0, 1).toUpperCase()}</span>}
          <div>
            <strong>{displayName}</strong>
            <span>{user?.email || "No email"}</span>
          </div>
        </div>
      </div>

      <form className="panel-form profile-form" onSubmit={onSubmit}>
        <div className="profile-grid">
          <label>
            Display name
            <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </label>
          <label>
            Email
            <input value={user?.email || ""} disabled />
          </label>
          <label>
            Timezone
            <input value={timezone} onChange={(event) => setTimezone(event.target.value)} />
          </label>
          <label>
            Profile picture
            <input type="file" accept="image/*" onChange={onPickProfilePic} />
          </label>
        </div>

        {profilePicName ? <p className="success-text">Selected image: {profilePicName}</p> : null}

        <label className="profile-bio-field">
          Bio
          <textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Tell people what this profile is about" />
        </label>

        {error ? <p className="error-text">{error}</p> : null}

        <div className="profile-actions">
          <button className="btn btn-primary" disabled={loading}>
            {loading ? "Saving..." : "Save Profile"}
          </button>
          <p className="profile-hint">The header avatar and name update immediately after saving.</p>
        </div>

        {saved ? <p className="success-text">Profile updated.</p> : null}
      </form>
    </section>
  );
}

export default App;
