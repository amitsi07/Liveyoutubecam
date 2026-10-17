import { useState, useEffect } from 'react';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { GetKeyView } from './components/GetKeyView';
import { StatusDialog } from './components/StatusDialog';
import { isUserAuthenticated, logoutUser } from './utils/keyHandler';
import { useStreamSimulator } from './hooks/useStreamSimulator';
import { Language } from './types/stream';
import { getTranslation } from './utils/i18n';
import { Globe } from 'lucide-react';

type AppRoute = 'login' | 'dashboard' | 'getkey';

export function App() {
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('dolive_lang') as Language) || 'en';
  });

  const [currentRoute, setCurrentRoute] = useState<AppRoute>('login');
  const [dialogMessage, setDialogMessage] = useState<string | null>(null);

  const t = getTranslation(lang);
  const { status, startStream, pauseStream, stopStream, clearMessage, clearLogs, isServerActive } =
    useStreamSimulator();

  useEffect(() => {
    // Check initial authentication state
    if (isUserAuthenticated()) {
      setCurrentRoute('dashboard');
    } else {
      setCurrentRoute('login');
    }
  }, []);

  const handleLanguageChange = (newLang: Language) => {
    setLang(newLang);
    localStorage.setItem('dolive_lang', newLang);
  };

  // Sync simulator messages to status dialog
  useEffect(() => {
    if (status.msg) {
      setDialogMessage(status.msg);
      clearMessage();
    }
  }, [status.msg, clearMessage]);

  const handleLoginSuccess = () => {
    setCurrentRoute('dashboard');
  };

  const handleLogout = () => {
    stopStream();
    logoutUser();
    setCurrentRoute('login');
    setDialogMessage(t.loggedOutMsg);
  };

  const handleCloseDialog = () => {
    setDialogMessage(null);
  };

  const handleShowMessage = (msg: string) => {
    setDialogMessage(msg);
  };

  return (
    <div className="w-full flex flex-col justify-center items-center py-6 px-4">
      {/* Language Switcher Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '12px',
          background: 'rgba(255, 255, 255, 0.85)',
          padding: '4px 12px',
          borderRadius: '20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
          zIndex: 20,
        }}
      >
        <Globe size={15} style={{ color: '#ff3399' }} />
        <button
          type="button"
          onClick={() => handleLanguageChange('en')}
          style={{
            background: lang === 'en' ? '#ff3399' : 'transparent',
            color: lang === 'en' ? '#fff' : '#666',
            border: 'none',
            borderRadius: '12px',
            padding: '3px 10px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          English
        </button>
        <button
          type="button"
          onClick={() => handleLanguageChange('vi')}
          style={{
            background: lang === 'vi' ? '#ff3399' : 'transparent',
            color: lang === 'vi' ? '#fff' : '#666',
            border: 'none',
            borderRadius: '12px',
            padding: '3px 10px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Tiếng Việt
        </button>
      </div>

      {currentRoute === 'login' && (
        <LoginView
          lang={lang}
          onLoginSuccess={handleLoginSuccess}
          onNavigateToGetKey={() => setCurrentRoute('getkey')}
          onShowMessage={handleShowMessage}
        />
      )}

      {currentRoute === 'getkey' && (
        <GetKeyView
          lang={lang}
          onBackToLogin={() => setCurrentRoute('login')}
          onAutoLogin={() => setCurrentRoute('dashboard')}
          onShowMessage={handleShowMessage}
        />
      )}

      {currentRoute === 'dashboard' && (
        <DashboardView
          lang={lang}
          status={status}
          isServerActive={isServerActive}
          onStartStream={startStream}
          onPauseStream={pauseStream}
          onStopStream={stopStream}
          onLogout={handleLogout}
          onShowMessage={handleShowMessage}
          onClearLogs={clearLogs}
        />
      )}

      {/* Global Status Dialog matching original web interface */}
      <StatusDialog
        isOpen={dialogMessage !== null}
        message={dialogMessage}
        onClose={handleCloseDialog}
      />
    </div>
  );
}

export default App;
