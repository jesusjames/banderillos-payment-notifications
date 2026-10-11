import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { History, HistoryEntry, SendStatus } from '../../modules/sms-forwarder';
import { formatTime } from '../format';
import { colors, fonts } from '../theme';
import { Card } from './Card';
import { ChunkyButton } from './ChunkyButton';

type Props = {
  history: History | null;
  onCheckInbox: () => void;
  checking: boolean;
};

const STATUS: Record<SendStatus, { label: string; bg: string }> = {
  pending: { label: '⏳ En cola', bg: colors.goldSoft },
  retrying: { label: '🔁 Reintentando', bg: colors.goldSoft },
  sent: { label: '✅ Enviado', bg: colors.greenSoft },
  failed: { label: '❌ Falló', bg: colors.redSoft },
};

/** Detalle del día: cada pago interceptado y los SMS que no se reenviaron. */
export function HistoryList({ history, onCheckInbox, checking }: Props) {
  const entries = history?.entries ?? [];
  const ignored = history?.ignored ?? [];

  return (
    <>
      <Card title={`Pagos interceptados (${entries.length})`}>
        {entries.length === 0 ? (
          <Text style={styles.muted}>Aún no hay pagos hoy.</Text>
        ) : (
          entries.map((entry, i) => <EntryRow key={entry.id} entry={entry} first={i === 0} />)
        )}
      </Card>

      <Card title={`SMS no reenviados (${ignored.length})`}>
        {ignored.length === 0 ? (
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
        )}
        <Text style={[styles.muted, styles.note]}>Solo se guarda el remitente y el motivo, nunca el texto.</Text>
      </Card>

      <ChunkyButton label="Buscar SMS no interceptados" variant="white" onPress={onCheckInbox} loading={checking} />
      <Text style={[styles.muted, styles.footer]}>
        Solo se guarda el día actual; al cambiar de día el historial se borra. La bandeja se revisa sola cada 15
        minutos y al abrir la app.
      </Text>
    </>
  );
}

function EntryRow({ entry, first }: { entry: HistoryEntry; first: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS[entry.status] ?? STATUS.pending;
  const tags = [
    entry.recovered ? 'Recuperado de la bandeja' : null,
    entry.attempts > 1 ? `Intento ${entry.attempts}` : null,
  ].filter(Boolean);

  return (
    <Pressable
      onPress={() => setExpanded((v) => !v)}
      style={[styles.entry, !first && styles.entryDivider]}
      accessibilityRole="button"
      accessibilityHint={expanded ? 'Contraer el mensaje' : 'Ver el mensaje completo'}
    >
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
      {tags.length > 0 ? <Text style={styles.tags}>{tags.join(' · ')}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  entry: {
    paddingVertical: 10,
  },
  entryDivider: {
    borderTopWidth: 2,
    borderTopColor: colors.cream,
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
  muted: {
    fontSize: 13,
    color: colors.muted,
  },
  note: {
    marginTop: 8,
  },
  footer: {
    marginTop: 10,
    textAlign: 'center',
  },
});
