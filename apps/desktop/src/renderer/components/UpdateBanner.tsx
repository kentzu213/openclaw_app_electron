import React from 'react';
import type { DesktopUpdaterState } from '../../main/updater/types';

function getMessage(state: DesktopUpdaterState): string | null {
  if (state.state === 'available') {
    return `Bản cập nhật ${state.availableVersion || 'mới'} đã sẵn sàng để tải xuống.`;
  }
  if (state.state === 'downloading') {
    return `Đang tải bản cập nhật ${state.availableVersion || ''}`.trim();
  }
  if (state.state === 'downloaded') {
    return `Bản cập nhật ${state.availableVersion || ''} đã tải xong. Cần khởi động lại để cài đặt.`.trim();
  }
  if (state.state === 'error' && state.error) {
    return state.error;
  }
  return null;
}

export function UpdateBanner({
  updaterState,
  onCheck,
  onDownload,
  onRestart,
}: {
  updaterState: DesktopUpdaterState;
  onCheck: () => void;
  onDownload: () => void;
  onRestart: () => void;
}) {
  const message = getMessage(updaterState);

  if (!message) {
    return null;
  }

  return (
    <div className={`update-banner update-banner--${updaterState.state}`}>
      <div className="update-banner__copy">
        <strong>Desktop update</strong>
        <span>{message}</span>
      </div>

      <div className="update-banner__actions">
        {(updaterState.state === 'error' || updaterState.state === 'idle') && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onCheck}>
            Kiểm tra lại
          </button>
        )}
        {updaterState.state === 'available' && (
          <button type="button" className="btn btn--primary btn--sm" onClick={onDownload}>
            Tải xuống
          </button>
        )}
        {updaterState.state === 'downloaded' && (
          <button type="button" className="btn btn--primary btn--sm" onClick={onRestart}>
            Khởi động lại
          </button>
        )}
      </div>
    </div>
  );
}
