import React, { useState, useEffect } from 'react';
import { getOrGenerateDailyKey, quickDemoLogin, getTodayDateString } from '../utils/keyHandler';
import { Check, Copy, ArrowLeft, Zap } from 'lucide-react';
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

  useEffect(() => {
    const key = getOrGenerateDailyKey();
    setDailyKey(key);
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

  const handleCopyAndAutoLogin = () => {
    if (dailyKey) {
      navigator.clipboard.writeText(dailyKey).catch(() => {});
    }
    quickDemoLogin();
    onShowMessage(t.loginSuccess);
    setTimeout(() => {
      onAutoLogin();
    }, 400);
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
          style={{ maxWidth: '340px' }}
        >
          {copied ? <Check size={18} /> : <Copy size={18} />}
          {copied ? t.copiedKeyBtn : t.copyKeyBtn}
        </button>

        <button
          type="button"
          onClick={handleCopyAndAutoLogin}
          style={{
            background: 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            padding: '12px 20px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            maxWidth: '340px',
            width: '100%',
            justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
          }}
        >
          <Zap size={18} />
          {t.copyAndAutoLogin}
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
