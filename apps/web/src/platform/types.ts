// Every device capability the app uses goes through these ports (PLAN §9.1).
// Components import `platform` from '@/platform' and never touch browser device APIs directly;
// ESLint enforces this outside src/platform/.

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export type PushRegistration =
  | { provider: 'webpush'; platform: 'web'; endpoint: string; p256dh: string; auth: string }
  | { provider: 'fcm' | 'apns'; platform: 'android' | 'ios'; nativeToken: string };

export interface PushPort {
  isSupported(): boolean;
  permission(): Promise<PermissionState>;
  /** Asks for permission if needed and returns the device registration for the API. */
  subscribe(vapidPublicKey: string): Promise<PushRegistration>;
  unsubscribe(): Promise<void>;
}

export interface LocalNotification {
  id: string;
  title: string;
  body: string;
  /** Deep link opened when tapped, e.g. `/trip/123` (PLAN §9.1). */
  url?: string;
  /** Repeat every N minutes until cancelled (driver reminder, PLAN §6.4). */
  everyMinutes?: number;
}

export interface LocalNotificationsPort {
  requestPermission(): Promise<boolean>;
  schedule(notification: LocalNotification): Promise<void>;
  cancel(id: string): Promise<void>;
  cancelAll(): Promise<void>;
  /**
   * False on the web: reminders only fire while the page is open. Native builds can
   * fire them with the app in the background or closed (PLAN §20.4).
   */
  readonly worksInBackground: boolean;
}

export interface QueuedItem<T> {
  id: string;
  createdAt: number;
  payload: T;
}

/** Durable FIFO used for offline trip events (PLAN §3.6). */
export interface OfflineQueuePort<T> {
  enqueue(id: string, payload: T): Promise<void>;
  list(): Promise<QueuedItem<T>[]>;
  remove(ids: string[]): Promise<void>;
  count(): Promise<number>;
}

/** Secrets such as the refresh token. */
export interface SecureStoragePort {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Non-secret user preferences (language, theme). */
export interface PreferencesPort {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  accuracyM: number;
}

export interface GeolocationPort {
  /** One-shot position at the moment of a tap; never continuous tracking (PLAN §14). */
  current(options?: { timeoutMs?: number }): Promise<GeoPoint | null>;
}

export interface CameraPort {
  pickPhoto(): Promise<Blob | null>;
}

export interface HapticsPort {
  success(): void;
  warning(): void;
}

export interface KeepAwakePort {
  enable(): Promise<void>;
  disable(): Promise<void>;
}

/**
 * Local alarm sound (PLAN §3.5): generated on the device, needs no network or downloaded file.
 */
export interface AlarmPort {
  start(): void;
  stop(): void;
  readonly active: boolean;
}

export interface AppLifecyclePort {
  onPause(listener: () => void): () => void;
  onResume(listener: () => void): () => void;
}

export interface Platform {
  kind: 'web' | 'native';
  push: PushPort;
  localNotifications: LocalNotificationsPort;
  offlineQueue<T>(name: string): OfflineQueuePort<T>;
  secureStorage: SecureStoragePort;
  preferences: PreferencesPort;
  geolocation: GeolocationPort;
  camera: CameraPort;
  haptics: HapticsPort;
  keepAwake: KeepAwakePort;
  appLifecycle: AppLifecyclePort;
  alarm: AlarmPort;
}
