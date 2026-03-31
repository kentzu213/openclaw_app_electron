import React from 'react';

export function TitleBar() {
  const handleMinimize = () => window.electronAPI?.window.minimize();
  const handleMaximize = () => window.electronAPI?.window.maximize();
  const handleClose = () => window.electronAPI?.window.close();

  return (
    <div className="titlebar">
      <div className="titlebar__logo">
        <div className="titlebar__logo-icon">⚡</div>
        <span>Starizzi</span>
      </div>
      <div className="titlebar__controls">
        <button className="titlebar__btn" onClick={handleMinimize} title="Minimize">─</button>
        <button className="titlebar__btn" onClick={handleMaximize} title="Maximize">□</button>
        <button className="titlebar__btn titlebar__btn--close" onClick={handleClose} title="Close">✕</button>
      </div>
    </div>
  );
}
