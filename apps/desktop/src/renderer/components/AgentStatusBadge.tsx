import React from 'react';
import type { AgentRuntimeState } from '../../main/agent/types';

const STATUS_META: Record<AgentRuntimeState['state'], { label: string; className: string }> = {
  idle: { label: 'Sẵn sàng', className: 'agent-status-badge--idle' },
  connecting: { label: 'Đang kết nối', className: 'agent-status-badge--connecting' },
  running: { label: 'Đang chạy', className: 'agent-status-badge--running' },
  error: { label: 'Lỗi', className: 'agent-status-badge--error' },
};

export function AgentStatusBadge({
  state,
  detail,
}: {
  state: AgentRuntimeState['state'];
  detail?: string;
}) {
  const meta = STATUS_META[state];

  return (
    <div className={`agent-status-badge ${meta.className}`} title={detail || meta.label}>
      <span className="agent-status-badge__dot" aria-hidden="true" />
      <span>{meta.label}</span>
    </div>
  );
}
