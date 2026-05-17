import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './utils/AuthContext';
import LoginPage from './pages/LoginPage';
import Header from './components/Header';
import KarakuriTei from './KarakuriTei';

// gameStorage を window.storage にマウント
import './utils/gameStorage';

function GameRoute() {
  const { user } = useAuth();

  // 認証ロード中
  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-900">
        <div className="text-amber-400 text-lg animate-pulse">読み込み中...</div>
      </div>
    );
  }

  // 未ログイン → ログインページへ
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Header />
      {/* ヘッダー分の上部パディング */}
      <div className="pt-10">
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
  if (user === undefined) return null; // ロード中
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}
