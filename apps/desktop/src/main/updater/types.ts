export type DesktopUpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface DesktopUpdaterState {
  state: DesktopUpdaterStatus;
  version?: string;
  availableVersion?: string;
  progress?: number;
  error?: string;
  checkedAt?: string;
}
