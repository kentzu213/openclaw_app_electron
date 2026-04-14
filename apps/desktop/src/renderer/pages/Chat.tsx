import React, { useDeferredValue, useState } from 'react';
import { AgentStatusBadge } from '../components/AgentStatusBadge';
import { ChatComposer } from '../components/ChatComposer';
import { ChatEmptyState } from '../components/ChatEmptyState';
import { ChatMessageList } from '../components/ChatMessageList';
import { useAgentWorkspaceStore } from '../store/agentWorkspace';

export function ChatPage() {
  const [draft, setDraft] = useState('');
  const session = useAgentWorkspaceStore((state) => state.session);
  const messages = useAgentWorkspaceStore((state) => state.messages);
  const runtimeState = useAgentWorkspaceStore((state) => state.runtimeState);
  const isBootstrapping = useAgentWorkspaceStore((state) => state.isBootstrapping);
  const isSending = useAgentWorkspaceStore((state) => state.isSending);
  const errorMessage = useAgentWorkspaceStore((state) => state.errorMessage);
  const onboardingState = useAgentWorkspaceStore((state) => state.onboardingState);
  const sendMessage = useAgentWorkspaceStore((state) => state.sendMessage);
  const newSession = useAgentWorkspaceStore((state) => state.newSession);
  const openOnboarding = useAgentWorkspaceStore((state) => state.openOnboarding);
  const refreshStatus = useAgentWorkspaceStore((state) => state.refreshStatus);
  const deferredMessages = useDeferredValue(messages);

  async function handleSubmit() {
    const text = draft.trim();
    if (!text) {
      return;
    }

    const sent = await sendMessage(text);
    if (sent) {
      setDraft('');
    }
  }

  return (
    <div className="chat-page">
      <header className="chat-page__header">
        <div>
          <div className="chat-page__eyebrow">Agent Workspace</div>
          <h1 className="chat-page__title">Chat Agent</h1>
          <p className="chat-page__subtitle">
            Managed runner qua IzziAPI. Tasks, memories và status sẽ được cập nhật từ cùng một luồng stream.
          </p>
        </div>

        <div className="chat-page__header-actions">
          <AgentStatusBadge state={runtimeState.state} detail={runtimeState.lastError} />
          <button
            type="button"
            className="btn btn--ghost"
            disabled={isSending}
            onClick={() => void newSession()}
          >
            Cuộc trò chuyện mới
          </button>
        </div>
      </header>

      <section className="chat-page__body">
        <div className="chat-session-card">
          <div>
            <div className="chat-session-card__label">Current session</div>
            <div className="chat-session-card__title">{session?.title || 'Đang khởi tạo session'}</div>
          </div>
          <div className="chat-session-card__meta-wrap">
            <div className="chat-session-card__meta">IzziAPI managed runner</div>
            <div className="chat-session-card__meta">
              {deferredMessages.length > 0 ? `${deferredMessages.length} messages` : 'No messages yet'}
            </div>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={runtimeState.state === 'running' || runtimeState.state === 'connecting'}
              onClick={() => void refreshStatus(session?.id)}
            >
              Làm mới status
            </button>
          </div>
        </div>

        {isBootstrapping ? (
          <div className="chat-loading-state">Đang tải lịch sử chat...</div>
        ) : deferredMessages.length === 0 ? (
          <ChatEmptyState
            onUsePrompt={setDraft}
            showFinishSetup={Boolean(onboardingState?.hasPendingSetup)}
            onFinishSetup={openOnboarding}
          />
        ) : (
          <ChatMessageList messages={deferredMessages} />
        )}
      </section>

      <footer className="chat-page__footer">
        {errorMessage && <div className="chat-error-banner">{errorMessage}</div>}
        {runtimeState.state === 'error' && !errorMessage && (
          <div className="chat-error-banner">
            Kết nối agent đang gặp lỗi. Bạn có thể làm mới status hoặc gửi lại khi backend sẵn sàng.
          </div>
        )}
        <ChatComposer
          value={draft}
          disabled={isBootstrapping || isSending}
          isSubmitting={isSending}
          onChange={setDraft}
          onSubmit={() => void handleSubmit()}
        />
      </footer>
    </div>
  );
}
