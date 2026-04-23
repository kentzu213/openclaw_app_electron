import React, { useState } from 'react';
import type { ExternalAgent, AIProvider } from '../types/agent-registry';
import { MODEL_PROVIDERS } from '../types/agent-registry';

interface AgentSetupPanelProps {
  agent: ExternalAgent;
  onClose: () => void;
  onInstallComplete: (agentId: string) => void;
}

export function AgentSetupPanel({ agent, onClose, onInstallComplete }: AgentSetupPanelProps) {
  const [step, setStep] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<AIProvider>('izzi');
  const [apiKey, setApiKey] = useState('');
  const [isInstalling, setIsInstalling] = useState(false);
  const [installLog, setInstallLog] = useState<string[]>([]);
  const [installDone, setInstallDone] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const steps = ['Thông tin', 'Model Provider', 'Cài đặt'];

  async function handleInstall() {
    setIsInstalling(true);
    setInstallLog([]);
    setInstallError(null);

    try {
      // Check if Docker is available via electronAPI
      if (window.electronAPI && (window.electronAPI as any).setup?.checkSystem) {
        setInstallLog((prev) => [...prev, '$ Kiểm tra hệ thống...']);
        const sysCheck = await (window.electronAPI as any).setup.checkSystem();
        setInstallLog((prev) => [
          ...prev,
          `  Docker: ${sysCheck.dockerRunning ? '✓ Running' : '⚠ Not running'}`,
        ]);
      }

      // Simulate Docker pull for now
      for (const stepMsg of agent.setupSteps) {
        await new Promise((r) => setTimeout(r, 800));
        setInstallLog((prev) => [...prev, `$ ${stepMsg}`]);
      }

      await new Promise((r) => setTimeout(r, 500));
      setInstallLog((prev) => [...prev, `✓ ${agent.displayName} đã được cài đặt thành công!`]);
      setInstallDone(true);

      setTimeout(() => {
        onInstallComplete(agent.id);
      }, 1500);
    } catch (err: any) {
      setInstallError(err.message || 'Cài đặt thất bại');
      setInstallLog((prev) => [...prev, `✗ Lỗi: ${err.message}`]);
    } finally {
      setIsInstalling(false);
    }
  }

  function renderStepContent() {
    if (step === 0) {
      return (
        <div className="agent-setup__info">
          <div className="agent-setup__hero">
            <span className="agent-setup__hero-icon">{agent.icon}</span>
            <div>
              <h3 className="agent-setup__hero-name">{agent.displayName}</h3>
              <div className="agent-setup__hero-stars">
                ⭐ {agent.githubStars} GitHub stars
              </div>
            </div>
          </div>

          <p className="agent-setup__desc">{agent.longDescription}</p>

          <div className="agent-setup__features">
            <h4>Tính năng:</h4>
            <div className="agent-setup__feature-list">
              {agent.features.map((f) => (
                <span key={f} className="agent-setup__feature-tag">
                  ✅ {f}
                </span>
              ))}
            </div>
          </div>

          <div className="agent-setup__meta">
            <div className="agent-setup__meta-item">
              <span className="agent-setup__meta-label">Setup method:</span>
              <span className="agent-setup__meta-value">
                {agent.setupMethod === 'docker' && '🐳 Docker'}
                {agent.setupMethod === 'npm' && '📦 npm'}
                {agent.setupMethod === 'pip' && '🐍 pip'}
                {agent.setupMethod === 'native' && '💻 Native'}
              </span>
            </div>
            <div className="agent-setup__meta-item">
              <span className="agent-setup__meta-label">Default port:</span>
              <span className="agent-setup__meta-value">{agent.defaultPort}</span>
            </div>
            <div className="agent-setup__meta-item">
              <span className="agent-setup__meta-label">Category:</span>
              <span className="agent-setup__meta-value">{agent.category}</span>
            </div>
          </div>

          <a
            className="agent-setup__github-link"
            href={agent.githubUrl}
            onClick={(e) => {
              e.preventDefault();
              if (window.electronAPI?.shell?.openExternal) {
                window.electronAPI.shell.openExternal(agent.githubUrl);
              } else {
                window.open(agent.githubUrl, '_blank');
              }
            }}
          >
            📘 Xem trên GitHub →
          </a>
        </div>
      );
    }

    if (step === 1) {
      const supportedProviders = MODEL_PROVIDERS.filter((p) =>
        agent.supportedProviders.includes(p.id),
      );

      return (
        <div className="agent-setup__provider">
          <h3>🧠 Chọn Model Provider</h3>
          <p className="agent-setup__provider-hint">
            Chọn nguồn AI model cho {agent.displayName}. IzziAPI được khuyến nghị — tất cả model trong 1 key.
          </p>

          <div className="agent-setup__provider-list">
            {supportedProviders.map((provider) => (
              <button
                key={provider.id}
                className={`agent-setup__provider-card ${
                  selectedProvider === provider.id ? 'agent-setup__provider-card--active' : ''
                }`}
                onClick={() => setSelectedProvider(provider.id)}
                type="button"
              >
                <div className="agent-setup__provider-header">
                  <span className="agent-setup__provider-name">
                    {provider.name}
                    {provider.recommended && (
                      <span className="agent-setup__provider-badge">⭐ Recommended</span>
                    )}
                    {provider.free && (
                      <span className="agent-setup__provider-free-badge">Free</span>
                    )}
                  </span>
                  {selectedProvider === provider.id && (
                    <span className="agent-setup__provider-check">✓</span>
                  )}
                </div>
                <span className="agent-setup__provider-desc">{provider.description}</span>
              </button>
            ))}
          </div>

          {MODEL_PROVIDERS.find((p) => p.id === selectedProvider)?.apiKeyRequired && (
            <div className="agent-setup__key-field">
              <label className="agent-setup__key-label">
                API Key ({MODEL_PROVIDERS.find((p) => p.id === selectedProvider)?.name})
              </label>
              <input
                className="agent-setup__key-input"
                type="password"
                placeholder={selectedProvider === 'izzi' ? 'izzi-xxxxxxxxxxxxxxxx' : 'Nhập API key...'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              {selectedProvider === 'izzi' && (
                <p className="agent-setup__key-hint">
                  Chưa có key?{' '}
                  <button
                    className="agent-setup__link"
                    onClick={() => {
                      if (window.electronAPI?.shell?.openExternal) {
                        window.electronAPI.shell.openExternal('https://izziapi.com/dashboard/keys');
                      } else {
                        window.open('https://izziapi.com/dashboard/keys', '_blank');
                      }
                    }}
                    type="button"
                  >
                    Tạo miễn phí tại izziapi.com →
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    // Step 2: Install
    return (
      <div className="agent-setup__install">
        <h3>🚀 Cài đặt {agent.displayName}</h3>

        {!isInstalling && !installDone && installLog.length === 0 && (
          <div className="agent-setup__install-summary">
            <div className="agent-setup__install-row">
              <span>Agent:</span>
              <span>{agent.icon} {agent.displayName}</span>
            </div>
            <div className="agent-setup__install-row">
              <span>Provider:</span>
              <span>{MODEL_PROVIDERS.find((p) => p.id === selectedProvider)?.name}</span>
            </div>
            <div className="agent-setup__install-row">
              <span>Method:</span>
              <span>{agent.setupMethod === 'docker' ? '🐳 Docker' : agent.setupMethod}</span>
            </div>
            <div className="agent-setup__install-row">
              <span>Port:</span>
              <span>{agent.defaultPort}</span>
            </div>
          </div>
        )}

        {installLog.length > 0 && (
          <div className="agent-setup__terminal">
            {installLog.map((line, i) => (
              <div
                key={i}
                className={`agent-setup__terminal-line ${
                  line.startsWith('✓') ? 'agent-setup__terminal-line--ok' :
                  line.startsWith('✗') ? 'agent-setup__terminal-line--err' : ''
                }`}
              >
                {line}
              </div>
            ))}
          </div>
        )}

        {installDone && (
          <div className="agent-setup__success">
            🎉 {agent.displayName} đã sẵn sàng! Bạn có thể bắt đầu chat ngay.
          </div>
        )}

        {installError && (
          <div className="agent-setup__error">❌ {installError}</div>
        )}

        {!isInstalling && !installDone && (
          <button
            className="agent-setup__install-btn"
            onClick={handleInstall}
            type="button"
          >
            🚀 Bắt đầu cài đặt
          </button>
        )}

        {isInstalling && (
          <div className="agent-setup__installing">
            <div className="agent-setup__spinner" />
            <span>Đang cài đặt...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="agent-modal-overlay" onClick={onClose}>
      <div className="agent-setup" onClick={(e) => e.stopPropagation()}>
        <button className="agent-modal__close" onClick={onClose} type="button">✕</button>

        {/* Progress */}
        <div className="agent-setup__progress">
          {steps.map((label, i) => (
            <div
              key={label}
              className={`agent-setup__progress-step ${
                i === step ? 'agent-setup__progress-step--active' :
                i < step ? 'agent-setup__progress-step--done' : ''
              }`}
            >
              <span className="agent-setup__progress-num">{i < step ? '✓' : i + 1}</span>
              <span className="agent-setup__progress-label">{label}</span>
            </div>
          ))}
        </div>

        {/* Content */}
        {renderStepContent()}

        {/* Navigation */}
        <div className="agent-setup__nav">
          {step > 0 && !installDone && (
            <button
              className="agent-setup__nav-btn agent-setup__nav-btn--back"
              onClick={() => setStep(step - 1)}
              disabled={isInstalling}
              type="button"
            >
              ← Quay lại
            </button>
          )}
          {step < steps.length - 1 && (
            <button
              className="agent-setup__nav-btn agent-setup__nav-btn--next"
              onClick={() => setStep(step + 1)}
              type="button"
            >
              Tiếp theo →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
