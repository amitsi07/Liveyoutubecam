import React from 'react';

interface StatusDialogProps {
  isOpen: boolean;
  message: string | null;
  onClose: () => void;
}

export const StatusDialog: React.FC<StatusDialogProps> = ({ isOpen, message, onClose }) => {
  if (!isOpen || !message) return null;

  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-content" onClick={(e) => e.stopPropagation()}>
        <strong>Thông báo:</strong>
        <p>{message}</p>
        <button type="button" onClick={onClose}>
          Đóng
        </button>
      </div>
    </div>
  );
};
