import React, { useState, useEffect } from 'react';
import { fetchServerDailyKey, authenticateWithServer, getTodayDateString } from '../utils/keyHandler';
import { Check, Copy, ArrowLeft, Zap, Loader2 } from 'lucide-react';
import { Language } from '../types/stream';
import { getTranslation } from '../utils/i18n';

interface GetKeyViewProps {
  lang: Language;
  onBackToLogin: () => void;
  onAutoLogin: () => void;
  onShowMessage: (msg: string) => void;
}

export const GetKeyView: React.FC<GetKeyViewProps> = ({
  lang,
  onBackToLogin,
  onAutoLogin,
  onShowMessage,
}) => {
  const t = getTranslation(lang);
  const [dailyKey, setDailyKey] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    let isMounted = true;
    fetchServerDailyKey().then((res) => {
      if (isMounted && res?.key) {
        setDailyKey(res.key);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopyKey = () => {
    if (!dailyKey) return;
    navigator.clipboard.writeText(dailyKey).then(
      () => {
        setCopied(true);
        onShowMessage(t.copiedSuccessToast);
        setTimeout(() => setCopied(false), 2500);
      },
      () => {
        onShowMessage(`Key: ${dailyKey}`);
      }
    );
  };

  const handleCopyAndAutoLogin = async () => {
    if (!dailyKey) return;
    setIsLoggingIn(true);
    navigator.clipboard.writeText(dailyKey).catch(() => {});

    const res = await authenticateWithServer(dailyKey);
    setIsLoggingIn(false);

    if (res.success) {
      onShowMessage(t.loginSuccess);
      setTimeout(() => {
        onAutoLogin();
      }, 300);
    } else {
      onShowMessage(res.error || t.invalidKeyError);
    }
  };

  return (
    <div className="container" style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: '8px' }}>
        <span
          style={{
            fontSize: '12px',
            color: '#777',
            backgroundColor: 'rgba(255, 102, 178, 0.1)',
            padding: '4px 10px',
            borderRadius: '12px',
            fontWeight: '600',
          }}
        >
          📅 Date: {getTodayDateString()}
        </span>
      </div>

      <h1>{t.todayKeyTitle}</h1>
      <p style={{ color: '#444', fontSize: '16px', margin: '4px 0' }}>
        {t.congratsKey}
      </p>
      <p style={{ color: '#777', fontSize: '14px', marginBottom: '20px' }}>
        {t.clickEnvelopeHint}
      </p>

      <div className="letter-box">
        <div
          className={`letter-image ${isOpen ? 'open' : ''}`}
          onClick={handleCopyKey}
          onMouseEnter={() => setIsOpen(true)}
          title="Click to copy key"
        >
          <div className="animated-mail">
            <div className="back-fold"></div>
            <div className="body"></div>
            <div className="top-fold"></div>
            <div className="left-fold"></div>
            <div className="letter" id="keytool">
              {dailyKey || t.generatingKey}
            </div>
          </div>
          <div className="shadow"></div>
        </div>
      </div>

      <div
        style={{
          marginTop: '25px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          alignItems: 'center',
        }}
      >
        <button
          type="button"
          className="primary-btn"
          onClick={handleCopyKey}
          disabled={!dailyKey}
          style={{ maxWidth: '340px' }}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? t.copiedKeyBtn : t.copyKeyBtn}
        </button>

        <button
          type="button"
          onClick={handleCopyAndAutoLogin}
          disabled={!dailyKey || isLoggingIn}
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '12px 20px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: !dailyKey || isLoggingIn ? 'not-allowed' : 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            maxWidth: '340px',
            width: '100%',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
            opacity: !dailyKey || isLoggingIn ? 0.7 : 1,
          }}
        >
          {isLoggingIn ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
          {isLoggingIn ? 'Authenticating...' : t.copyAndAutoLogin}
        </button>

        <button
          type="button"
          onClick={onBackToLogin}
          style={{
            background: 'none',
            border: 'none',
            color: '#ff3399',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '15px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '8px',
          }}
        >
          <ArrowLeft size={16} /> {t.backToLogin}
        </button>
      </div>
    </div>
  );
};
