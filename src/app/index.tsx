import { router } from 'expo-router';
import { Alert, Image, StyleSheet, Switch, Text, View } from 'react-native';

import SmsForwarder, { type ForwarderConfig } from '../../modules/sms-forwarder';
import { Card } from '../components/Card';
import { ChunkyButton } from '../components/ChunkyButton';
import { HistorySummary } from '../components/HistorySummary';
import { PermissionRow } from '../components/PermissionRow';
import { Screen } from '../components/Screen';
import { readConfig, showPreviewAlert, useForwarderStatus, useHistory, useHistoryActions } from '../hooks/useForwarder';
import { colors, fonts, stroke } from '../theme';

const describeFilters = (config: ForwarderConfig) =>
  `Reenvía si contiene «${config.includeText}» · Remitente: ${config.allowedSenders.trim() || 'cualquiera'}`;

export default function HomeScreen() {
  const native = SmsForwarder;
  const { config, setConfig, smsGranted, smsBlocked, batteryOk, refresh, requestSmsPermission } =
    useForwarderStatus();
  const { history, refresh: refreshHistory } = useHistory();
  const { retrying, retryFailed } = useHistoryActions(refreshHistory);

  const active = !!native && config.enabled && smsGranted === true;
  const telegramReady = !!config.token && !!config.chatId;

  const toggleEnabled = async (value: boolean) => {
    if (!native) return showPreviewAlert();
    if (value && !telegramReady) {
      Alert.alert('Falta configurar Telegram', 'Guarda el token del bot y el chat ID antes de activar el reenvío.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Configurar', onPress: () => router.push('/configuracion') },
      ]);
      return;
    }
    await native.saveConfig({ enabled: value });
    setConfig(readConfig());
    if (value && smsGranted === false) requestSmsPermission();
  };

  return (
    <Screen
      topInset
      onRefresh={async () => {
        await refresh();
        refreshHistory();
      }}
    >
      <View style={styles.header}>
        <Image
          source={require('../../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Banderillos"
        />
        <View style={styles.tagWrap}>
          <Text style={styles.tag}>Pagos</Text>
        </View>
      </View>

      {!native ? (
        <Card color={colors.goldSoft}>
          <Text style={styles.body}>
            Vista previa: este build no incluye el módulo nativo de SMS (Expo Go o web). Para usar la app de verdad
            ejecuta <Text style={styles.code}>npx expo run:android</Text>.
          </Text>
        </Card>
      ) : null}

      <Card color={active ? colors.gold : colors.redSoft}>
        <Text style={styles.statusText}>{active ? '🟢 Reenviando pagos' : '🔴 Detenido'}</Text>
        <Text style={styles.statusDetail}>
          {active
            ? 'Cada SMS de pago se envía al grupo de Telegram.'
            : !native
              ? 'Sin módulo nativo.'
              : !config.enabled
                ? 'El reenvío está apagado.'
                : 'Falta el permiso de SMS.'}
        </Text>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Reenvío activo</Text>
          <Switch
            value={config.enabled}
            onValueChange={toggleEnabled}
            trackColor={{ false: '#CBBFB8', true: colors.red }}
            thumbColor={colors.white}
          />
        </View>
      </Card>

      <Card title="Permisos">
        <PermissionRow
          label="SMS"
          ok={native ? smsGranted : false}
          okText="Concedido"
          missingText="No concedido: la app no puede leer los SMS."
        >
          <ChunkyButton label="Conceder permiso de SMS" small onPress={requestSmsPermission} />
          {smsBlocked ? (
            <>
              <Text style={styles.hint}>
                Si aparece bloqueado: Ajustes de la app → menú ⋮ → «Permitir ajustes restringidos», y luego Permisos →
                SMS → Permitir.
              </Text>
              <ChunkyButton label="Abrir ajustes de la app" small variant="white" onPress={() => native?.openAppSettings()} />
            </>
          ) : null}
        </PermissionRow>
        <PermissionRow
          label="Optimización de batería"
          ok={native ? batteryOk : false}
          okText="Desactivada: Android no detendrá la app."
          missingText="Activada: Android podría retrasar o bloquear los reenvíos."
        >
          <ChunkyButton
            label="Ignorar optimización de batería"
            small
            variant="gold"
            onPress={() => (native ? native.openBatteryOptimizationSettings() : showPreviewAlert())}
          />
        </PermissionRow>
        <Text style={styles.hint}>
          En Xiaomi activa también «Inicio automático» y en Samsung agrega la app a «Apps que nunca se suspenden» (ver
          README).
        </Text>
      </Card>

      <HistorySummary
        history={history}
        onRetryFailed={retryFailed}
        retrying={retrying}
        onOpenHistory={() => router.push('/historial')}
      />

      <Card title="Telegram y filtros">
        <Text style={[styles.body, !telegramReady && styles.warning]}>
          {telegramReady ? '✅ Bot y grupo configurados.' : '⚠️ Falta configurar el bot de Telegram.'}
        </Text>
        <Text style={styles.hint}>{describeFilters(config)}</Text>
        <ChunkyButton
          label="Abrir configuración →"
          variant={telegramReady ? 'white' : 'red'}
          onPress={() => router.push('/configuracion')}
          style={styles.configButton}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: '100%',
    height: 220,
  },
  tagWrap: {
    marginTop: -4,
    backgroundColor: colors.red,
    borderWidth: stroke,
    borderColor: colors.dark,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 2,
    transform: [{ rotate: '-3deg' }],
  },
  tag: {
    fontFamily: fonts.title,
    fontSize: 26,
    color: colors.white,
    letterSpacing: 1,
  },
  statusText: {
    fontFamily: fonts.title,
    fontSize: 30,
    color: colors.dark,
  },
  statusDetail: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.dark,
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: colors.dark,
  },
  switchLabel: {
    fontFamily: fonts.title,
    fontSize: 20,
    color: colors.dark,
  },
  body: {
    fontSize: 15,
    color: colors.dark,
  },
  warning: {
    color: colors.red,
    fontWeight: '700',
  },
  code: {
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
    marginTop: 4,
  },
  configButton: {
    marginTop: 12,
  },
});
