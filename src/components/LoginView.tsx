import React, { useState } from 'react';
import { Eye, EyeOff, Zap, KeyRound } from 'lucide-react';
import { checkKey, quickDemoLogin, getTodayDateString } from '../utils/keyHandler';
import { Language } from '../types/stream';
import { getTranslation } from '../utils/i18n';

interface LoginViewProps {
  lang: Language;
  onLoginSuccess: () => void;
  onNavigateToGetKey: () => void;
  onShowMessage: (msg: string) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  lang,
  onLoginSuccess,
  onNavigateToGetKey,
  onShowMessage,
}) => {
  const t = getTranslation(lang);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyInput.trim()) {
      onShowMessage(t.keyRequired);
      return;
    }

    const result = checkKey(keyInput.trim());
    const message = result.valid ? t.loginSuccess : t.invalidKeyError;
    onShowMessage(message);
    if (result.valid) {
      setTimeout(() => {
        onLoginSuccess();
      }, 400);
    }
  };

  const handleQuickDemoLogin = () => {
    const demo = quickDemoLogin();
    setKeyInput(demo.key);
    onShowMessage(t.loginSuccess);
    setTimeout(() => {
      onLoginSuccess();
    }, 400);
  };

  return (
    <div className="container">
      <div style={{ textAlign: 'center', marginBottom: '8px' }}>
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

      <h1>{t.loginTitle}</h1>

      <div id="connectFormBox">
        <form onSubmit={handleSubmit}>
          <div className="section">
            <label className="form-label" htmlFor="key">
              {t.enterKeyLabel}
            </label>
            <div className="input-container">
              <input
                type={showKey ? 'text' : 'password'}
                id="key"
                name="key"
                placeholder={t.enterKeyPlaceholder}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                required
              />
              <button
                type="button"
                className="eye-button"
                onClick={() => setShowKey(!showKey)}
                title={showKey ? t.hideKey : t.showKey}
              >
                {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button type="submit" className="primary-btn">
            <KeyRound size={18} />
            {t.loginButton}
          </button>
        </form>

        <div style={{ marginTop: '16px', textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleQuickDemoLogin}
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 16px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
              transition: 'transform 0.15s, opacity 0.15s',
            }}
          >
            <Zap size={16} />
            {t.quickDemoLogin}
          </button>
        </div>

        <p className="key-info">
          {t.noKeyYet} <br />
          <strong>{t.statusLabel}</strong>{' '}
          <span
            className="key-link"
            onClick={onNavigateToGetKey}
            role="button"
            tabIndex={0}
          >
            {t.getKeyLinkText}
          </span>
        </p>
      </div>
    </div>
  );
};
