import { StyleSheet, Text, View } from 'react-native';

import type { History } from '../../modules/sms-forwarder';
import { formatDay, plural } from '../format';
import { countHistory, summaryOf } from '../history';
import { colors, fonts } from '../theme';
import { Card } from './Card';
import { ChunkyButton } from './ChunkyButton';

type Props = {
  history: History | null;
  onRetryFailed: () => void;
  retrying: boolean;
  /** Si se pasa, muestra el botón para abrir el historial completo. */
  onOpenHistory?: () => void;
};

/** Contadores del día y estado general. Lo que se mira de un vistazo. */
export function HistorySummary({ history, onRetryFailed, retrying, onOpenHistory }: Props) {
  const counts = countHistory(history);
  const summary = summaryOf(counts);

  return (
    <Card title="Pagos de hoy" right={<Text style={styles.day}>{formatDay(history?.day)}</Text>}>
      <View style={styles.stats}>
        <Stat label="Interceptados" value={counts.intercepted} bg={colors.cream} />
        <Stat label="Enviados" value={counts.sent} bg={colors.greenSoft} />
        <Stat label="En cola" value={counts.queued} bg={colors.goldSoft} />
        <Stat label="Fallidos" value={counts.failed} bg={colors.redSoft} />
      </View>

      <View style={[styles.banner, { backgroundColor: summary.bg }]}>
        <Text style={styles.bannerText}>{summary.text}</Text>
      </View>

      {counts.interceptErrors > 0 ? (
        <View style={[styles.banner, { backgroundColor: colors.redSoft }]}>
          <Text style={styles.bannerText}>
            ⚠️ {plural(counts.interceptErrors, 'error', 'errores')} al interceptar SMS. Míralos en el historial.
          </Text>
        </View>
      ) : null}

      {counts.failed > 0 ? (
        <ChunkyButton
          label={`Reintentar fallidos (${counts.failed})`}
          onPress={onRetryFailed}
          loading={retrying}
          style={styles.button}
        />
      ) : null}

      {onOpenHistory ? (
        <ChunkyButton label="Ver historial completo →" variant="white" onPress={onOpenHistory} style={styles.button} />
      ) : null}
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

const styles = StyleSheet.create({
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
  banner: {
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
  },
  bannerText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.dark,
  },
  button: {
    marginTop: 4,
    marginBottom: 6,
  },
});
