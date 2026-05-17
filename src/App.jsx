import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './utils/AuthContext';
import LoginPage from './pages/LoginPage';
import Header from './components/Header';
import KarakuriTei from './KarakuriTei';

// gameStorage を window.storage にマウント
import './utils/gameStorage';

// R3-004: 和テイストのローディング表示
function WaLoading() {
  // 既存パレットに準拠: vermilion / sand / ink
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#2B2A28' }}
      role="status"
      aria-live="polite"
      aria-label="読み込み中"
    >
      <style>{`
        @keyframes karakuri-spin { from { transform: rotate(0); } to { transform: rotate(360deg); } }
        @keyframes karakuri-dots { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }
        .karakuri-ring {
          width: 56px; height: 56px;
          border-radius: 50%;
          border: 2px solid rgba(232,223,201,0.18);
          border-top-color: #B53E3A;
          animation: karakuri-spin 1.1s linear infinite;
        }
        .karakuri-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #E8DFC9;
          margin: 0 3px;
          display: inline-block;
          animation: karakuri-dots 1.2s ease-in-out infinite;
        }
        .karakuri-dot:nth-child(2) { animation-delay: 0.16s; }
        .karakuri-dot:nth-child(3) { animation-delay: 0.32s; }
      `}</style>
      <div className="text-center">
        <div className="karakuri-ring mx-auto mb-6" aria-hidden="true" />
        <div
          style={{
            color: '#E8DFC9',
            fontFamily: '"Noto Serif JP", serif',
            letterSpacing: '0.3em',
            fontSize: '1.5rem',
          }}
        >
          カラクリ庭
        </div>
        <div className="mt-3" aria-hidden="true">
          <span className="karakuri-dot" />
          <span className="karakuri-dot" />
          <span className="karakuri-dot" />
        </div>
      </div>
    </div>
  );
}

function GameRoute() {
  const { user } = useAuth();

  // 認証ロード中
  if (user === undefined) {
    return <WaLoading />;
  }

  // 未ログイン → ログインページへ
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Header />
      {/* ヘッダー分の上部パディング（セーフエリア込み） */}
      <div style={{ paddingTop: 'calc(2.5rem + env(safe-area-inset-top))' }}>
        <KarakuriTei />
      </div>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginRouteWrapper />} />
          <Route path="/*" element={<GameRoute />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

// ログイン済みなら / へリダイレクト
function LoginRouteWrapper() {
  const { user } = useAuth();
  if (user === undefined) return <WaLoading />;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}
