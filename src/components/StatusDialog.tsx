import React from 'react';

interface StatusDialogProps {
  isOpen: boolean;
  message: string | null;
  onClose: () => void;
}

export const StatusDialog: React.FC<StatusDialogProps> = ({ isOpen, message, onClose }) => {
  if (!isOpen || !message) return null;

  const isError =
    message.toLowerCase().includes('error') ||
    message.toLowerCase().includes('fail') ||
    message.toLowerCase().includes('rejected') ||
    message.toLowerCase().includes('invalid');

  return (
    <div className="popup-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="popup-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '460px',
          width: '90%',
          borderRadius: '14px',
          padding: '20px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
          border: isError ? '1px solid #fca5a5' : '1px solid #ffd6e8',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '20px' }}>{isError ? '⚠️' : '📢'}</span>
          <strong style={{ fontSize: '16px', color: isError ? '#dc2626' : '#ff3399' }}>
            {isError ? 'Broadcast Notice / Thông báo' : 'Notice / Thông báo'}
          </strong>
        </div>
        <p style={{ fontSize: '14px', color: '#374151', lineHeight: '1.5', whiteSpace: 'pre-line' }}>
          {message}
        </p>
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: isError ? '#ef4444' : '#ff3399',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 18px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            OK / Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
