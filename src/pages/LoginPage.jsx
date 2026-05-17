import { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../utils/firebase';

function mapAuthError(code) {
  switch (code) {
    case 'auth/popup-blocked':
      return 'ポップアップがブロックされました。ブラウザの設定をご確認ください';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'ログインがキャンセルされました';
    case 'auth/network-request-failed':
      return 'ネットワークに接続できませんでした';
    default:
      return 'ログインに失敗しました。しばらく経ってから再度お試しください';
  }
}

export default function LoginPage() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // 成功時は AuthContext が状態を更新するため、ここでは何もしない
    } catch (err) {
      console.error('Login error:', err);
      setError(mapAuthError(err?.code));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-stone-900">
      <div className="text-center p-8 rounded-2xl bg-stone-800 shadow-2xl max-w-sm w-full mx-4">
        {/* タイトル */}
        <h1 className="text-4xl font-bold text-amber-400 mb-2 tracking-wider">カラクリ庭</h1>
        <p className="text-stone-400 text-sm mb-8">からくりを操り、庭を完成させよう</p>

        {/* ログインボタン */}
        <button
          onClick={handleLogin}
          disabled={loading}
          aria-label="Googleアカウントでログイン"
          aria-busy={loading}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed text-gray-800 font-semibold py-3 px-6 rounded-xl transition-colors shadow"
        >
          <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.6 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.6 16.1 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.6 29.5 4 24 4c-7.7 0-14.4 4.4-17.7 10.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.3 26.8 36 24 36c-5.3 0-9.7-3.4-11.3-8H6.1C9.5 38.5 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.2 5.2C36.9 36.9 44 32 44 24c0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
          {loading ? 'ログイン中…' : 'Googleでログイン'}
        </button>

        {error && (
          <div role="alert" aria-live="polite" className="text-red-400 text-sm mt-3">
            {error}
          </div>
        )}

        <p className="text-stone-500 text-xs mt-4">
          ログインすると、ゲームの進捗が保存されます
        </p>
      </div>
    </div>
  );
}
