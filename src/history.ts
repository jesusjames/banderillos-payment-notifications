import type { History } from '../modules/sms-forwarder';
import { plural } from './format';
import { colors } from './theme';

export type HistoryCounts = {
  intercepted: number;
  sent: number;
  queued: number;
  failed: number;
  ignored: number;
  interceptErrors: number;
};

export function countHistory(history: History | null): HistoryCounts {
  const entries = history?.entries ?? [];
  const ignored = history?.ignored ?? [];
  return {
    intercepted: entries.length,
    sent: entries.filter((e) => e.status === 'sent').length,
    queued: entries.filter((e) => e.status === 'pending' || e.status === 'retrying').length,
    failed: entries.filter((e) => e.status === 'failed').length,
    ignored: ignored.length,
    interceptErrors: ignored.filter((i) => i.isError).length,
  };
}

/** Frase de estado del día: lo primero que hay que mirar. */
export function summaryOf(counts: HistoryCounts): { text: string; bg: string } {
  if (counts.failed > 0) {
    return {
      text: `⚠️ ${plural(counts.failed, 'envío falló', 'envíos fallaron')}. Revisa el error y reintenta.`,
      bg: colors.redSoft,
    };
  }
  if (counts.queued > 0) {
    return {
      text: `⏳ ${plural(counts.queued, 'pago en cola', 'pagos en cola')}: se enviará apenas haya internet.`,
      bg: colors.goldSoft,
    };
  }
  if (counts.intercepted > 0) {
    return { text: `✅ Todos los pagos de hoy se enviaron a Telegram (${counts.intercepted}).`, bg: colors.greenSoft };
  }
  return { text: 'Aún no se ha interceptado ningún pago hoy.', bg: colors.cream };
}
