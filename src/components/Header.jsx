import { signOut } from 'firebase/auth';
import { auth } from '../utils/firebase';
import { useAuth } from '../utils/AuthContext';

export default function Header() {
  const { user } = useAuth();

  const handleLogout = async () => {
    await signOut(auth);
  };

  if (!user) return null;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-2 bg-stone-900/90 backdrop-blur border-b border-stone-700">
      <span className="text-amber-400 font-bold tracking-wider">カラクリ庭</span>
      <div className="flex items-center gap-3">
        <img
          src={user.photoURL || ''}
          alt={user.displayName || 'User'}
          className="w-7 h-7 rounded-full"
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <span className="text-stone-300 text-sm hidden sm:block">{user.displayName}</span>
        <button
          onClick={handleLogout}
          className="text-stone-400 hover:text-white text-sm px-3 py-1 rounded-lg hover:bg-stone-700 transition-colors"
        >
          ログアウト
        </button>
      </div>
    </header>
  );
}
