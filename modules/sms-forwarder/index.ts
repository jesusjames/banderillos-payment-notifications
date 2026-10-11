import { NativeModule, requireOptionalNativeModule } from 'expo';

export const DEFAULT_INCLUDE_TEXT = 'recibiste una transferencia de';
export const DEFAULT_EXCLUDE_TEXT = 'clave, código, OTP';

export type ForwarderConfig = {
  enabled: boolean;
  token: string;
  chatId: string;
  includeText: string;
  excludeText: string;
  /** Lista separada por comas; vacío = cualquier remitente. */
  allowedSenders: string;
};

export type SendStatus = 'pending' | 'retrying' | 'sent' | 'failed';

/** SMS de pago interceptado y el estado de su envío a Telegram. */
export type HistoryEntry = {
  id: string;
  receivedAt: number;
  sender: string;
  text: string;
  status: SendStatus;
  attempts: number;
  error: string | null;
  sentAt: number | null;
  /** El receiver no lo interceptó; se recuperó de la bandeja de SMS. */
  recovered: boolean;
};

/** SMS que no se reenvió (o error al interceptarlo). No se guarda su texto. */
export type IgnoredSms = {
  at: number;
  sender: string;
  reason: string;
  isError: boolean;
};

export type History = {
  day: string;
  entries: HistoryEntry[];
  ignored: IgnoredSms[];
};

type Events = {
  onHistoryChanged: () => void;
};

declare class SmsForwarderModule extends NativeModule<Events> {
  getConfig(): ForwarderConfig;
  saveConfig(config: Partial<ForwarderConfig>): Promise<void>;
  sendTest(token: string, chatId: string): Promise<{ ok: boolean; error: string | null }>;
  getHistory(): History;
  retryFailed(): Promise<number>;
  checkMissedSms(): Promise<number>;
  isIgnoringBatteryOptimizations(): boolean;
  openBatteryOptimizationSettings(): void;
  openAppSettings(): void;
}

/**
 * null cuando el módulo nativo no existe (Expo Go, web): la pantalla se muestra en modo vista previa.
 */
export default requireOptionalNativeModule<SmsForwarderModule>('SmsForwarder');
