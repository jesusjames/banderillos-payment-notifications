import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { History, HistoryEntry, SendStatus } from '../../modules/sms-forwarder';
import { formatDay, formatTime, plural } from '../format';
import { colors, fonts } from '../theme';
import { Card } from './Card';
import { ChunkyButton } from './ChunkyButton';

type Props = {
  history: History | null;
  onRetryFailed: () => void;
  retrying: boolean;
  onCheckInbox: () => void;
  checking: boolean;
};

const STATUS: Record<SendStatus, { label: string; bg: string }> = {
  pending: { label: '⏳ En cola', bg: colors.goldSoft },
  retrying: { label: '🔁 Reintentando', bg: colors.goldSoft },
  sent: { label: '✅ Enviado', bg: colors.greenSoft },
  failed: { label: '❌ Falló', bg: colors.redSoft },
};

export function HistorySection({ history, onRetryFailed, retrying, onCheckInbox, checking }: Props) {
  const [showIgnored, setShowIgnored] = useState(false);
  const entries = history?.entries ?? [];
  const ignored = history?.ignored ?? [];

  const sent = entries.filter((e) => e.status === 'sent').length;
  const queued = entries.filter((e) => e.status === 'pending' || e.status === 'retrying').length;
  const failed = entries.filter((e) => e.status === 'failed').length;
  const interceptErrors = ignored.filter((i) => i.isError).length;

  let summary: { text: string; bg: string };
  if (failed > 0) {
    summary = { text: `⚠️ ${plural(failed, 'envío falló', 'envíos fallaron')}. Revisa el error y reintenta.`, bg: colors.redSoft };
  } else if (queued > 0) {
    summary = {
      text: `⏳ ${plural(queued, 'pago en cola', 'pagos en cola')}: se enviará apenas haya internet.`,
      bg: colors.goldSoft,
    };
  } else if (entries.length > 0) {
    summary = { text: `✅ Todos los pagos de hoy se enviaron a Telegram (${entries.length}).`, bg: colors.greenSoft };
  } else {
    summary = { text: 'Aún no se ha interceptado ningún pago hoy.', bg: colors.cream };
  }

  return (
    <Card title="Historial de hoy" right={<Text style={styles.day}>{formatDay(history?.day)}</Text>}>
      <View style={styles.stats}>
        <Stat label="Interceptados" value={entries.length} bg={colors.cream} />
        <Stat label="Enviados" value={sent} bg={colors.greenSoft} />
        <Stat label="En cola" value={queued} bg={colors.goldSoft} />
        <Stat label="Fallidos" value={failed} bg={colors.redSoft} />
      </View>

      <View style={[styles.summary, { backgroundColor: summary.bg }]}>
        <Text style={styles.summaryText}>{summary.text}</Text>
      </View>

      {interceptErrors > 0 ? (
        <View style={[styles.summary, { backgroundColor: colors.redSoft }]}>
          <Text style={styles.summaryText}>
            ⚠️ {plural(interceptErrors, 'error', 'errores')} al interceptar SMS. Mira "SMS no reenviados".
          </Text>
        </View>
      ) : null}

      {failed > 0 ? (
        <ChunkyButton
          label={`Reintentar fallidos (${failed})`}
          onPress={onRetryFailed}
          loading={retrying}
          style={styles.retry}
        />
      ) : null}

      {entries.map((entry) => (
        <EntryRow key={entry.id} entry={entry} />
      ))}

      <Pressable onPress={() => setShowIgnored((v) => !v)} style={styles.ignoredToggle} accessibilityRole="button">
        <Text style={styles.ignoredToggleText}>
          {showIgnored ? '▾' : '▸'} SMS no reenviados hoy ({ignored.length})
        </Text>
      </Pressable>
      {showIgnored ? (
        ignored.length === 0 ? (
          <Text style={styles.muted}>Ninguno.</Text>
        ) : (
          ignored.map((item, i) => (
            <View key={`${item.at}-${i}`} style={styles.ignoredRow}>
              <Text style={styles.ignoredTime}>{formatTime(item.at)}</Text>
              <View style={styles.flex}>
                <Text style={styles.ignoredSender}>{item.sender}</Text>
                <Text style={[styles.ignoredReason, item.isError && styles.errorText]}>
                  {item.isError ? '⚠️ ' : ''}
                  {item.reason}
                </Text>
              </View>
            </View>
          ))
        )
      ) : null}

      <ChunkyButton
        label="Buscar SMS no interceptados"
        variant="white"
        small
        onPress={onCheckInbox}
        loading={checking}
        style={styles.check}
      />
      <Text style={styles.muted}>
        Solo se guarda el día actual; al cambiar de día el historial se borra. La bandeja se revisa sola cada 15
        minutos y al abrir la app.
      </Text>
    </Card>
  );
}

function Stat({ label, value, bg }: { label: string; value: number; bg: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EntryRow({ entry }: { entry: HistoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS[entry.status] ?? STATUS.pending;

  return (
    <Pressable onPress={() => setExpanded((v) => !v)} style={styles.entry} accessibilityRole="button">
      <View style={styles.entryHeader}>
        <Text style={styles.entryTime}>{formatTime(entry.receivedAt)}</Text>
        <Text style={styles.entrySender} numberOfLines={1}>
          {entry.sender}
        </Text>
        <View style={[styles.badge, { backgroundColor: status.bg }]}>
          <Text style={styles.badgeText}>
            {status.label}
            {entry.status === 'sent' && entry.sentAt ? ` ${formatTime(entry.sentAt)}` : ''}
          </Text>
        </View>
      </View>
      <Text style={styles.entryText} numberOfLines={expanded ? undefined : 2}>
        {entry.text}
      </Text>
      {entry.error && entry.status !== 'sent' ? <Text style={styles.errorText}>{entry.error}</Text> : null}
      {entry.recovered || entry.attempts > 1 ? (
        <Text style={styles.tags}>
          {[entry.recovered ? 'Recuperado de la bandeja' : null, entry.attempts > 1 ? `Intento ${entry.attempts}` : null]
            .filter(Boolean)
            .join(' · ')}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  day: {
    fontWeight: '800',
    color: colors.muted,
  },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  stat: {
    flexGrow: 1,
    flexBasis: '45%',
    borderWidth: 2.5,
    borderColor: colors.dark,
    borderRadius: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fonts.title,
    fontSize: 28,
    color: colors.dark,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.dark,
  },
  summary: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.dark,
  },
  retry: {
    marginBottom: 12,
  },
  entry: {
    borderTopWidth: 2,
    borderTopColor: colors.cream,
    paddingVertical: 10,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  entryTime: {
    fontFamily: fonts.title,
    fontSize: 17,
    color: colors.dark,
  },
  entrySender: {
    flex: 1,
    fontSize: 13,
    color: colors.muted,
  },
  badge: {
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.dark,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.dark,
  },
  entryText: {
    fontSize: 14,
    color: colors.dark,
  },
  errorText: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: colors.red,
  },
  tags: {
    marginTop: 4,
    fontSize: 12,
    color: colors.muted,
    fontWeight: '700',
  },
  ignoredToggle: {
    paddingVertical: 10,
    marginTop: 4,
  },
  ignoredToggleText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.dark,
  },
  ignoredRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 6,
  },
  ignoredTime: {
    fontWeight: '800',
    color: colors.dark,
  },
  ignoredSender: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.dark,
  },
  ignoredReason: {
    fontSize: 13,
    color: colors.muted,
  },
  check: {
    marginTop: 12,
    marginBottom: 8,
  },
  muted: {
    fontSize: 12,
    color: colors.muted,
  },
});
