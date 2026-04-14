import { DatabaseManager } from '../db/database';
import type { OnboardingState } from '../agent/types';

const SEEN_KEY = 'onboarding_seen_at';
const DISMISSED_KEY = 'onboarding_dismissed_at';
const COMPLETED_KEY = 'onboarding_completed_at';

function mapState(db: DatabaseManager): OnboardingState {
  const seenAt = db.getSetting(SEEN_KEY) ?? undefined;
  const dismissedAt = db.getSetting(DISMISSED_KEY) ?? undefined;
  const completedAt = db.getSetting(COMPLETED_KEY) ?? undefined;

  return {
    seenAt,
    dismissedAt,
    completedAt,
    shouldAutoOpen: !seenAt && !dismissedAt && !completedAt,
    hasPendingSetup: !completedAt,
    isCompleted: Boolean(completedAt),
  };
}

export class OnboardingService {
  private db: DatabaseManager;

  constructor(db: DatabaseManager) {
    this.db = db;
  }

  getState(): OnboardingState {
    return mapState(this.db);
  }

  markSeen(): OnboardingState {
    if (!this.db.getSetting(SEEN_KEY)) {
      this.db.setSetting(SEEN_KEY, new Date().toISOString());
    }
    return this.getState();
  }

  dismiss(): OnboardingState {
    if (!this.db.getSetting(SEEN_KEY)) {
      this.db.setSetting(SEEN_KEY, new Date().toISOString());
    }
    this.db.setSetting(DISMISSED_KEY, new Date().toISOString());
    return this.getState();
  }

  complete(): OnboardingState {
    if (!this.db.getSetting(SEEN_KEY)) {
      this.db.setSetting(SEEN_KEY, new Date().toISOString());
    }
    this.db.deleteSetting(DISMISSED_KEY);
    this.db.setSetting(COMPLETED_KEY, new Date().toISOString());
    return this.getState();
  }
}
