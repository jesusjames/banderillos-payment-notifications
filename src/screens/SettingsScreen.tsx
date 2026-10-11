import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Image,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import SmsForwarder, {
  DEFAULT_EXCLUDE_TEXT,
  DEFAULT_INCLUDE_TEXT,
  type ForwarderConfig,
  type History,
} from '../../modules/sms-forwarder';
import { Card } from '../components/Card';
import { ChunkyButton } from '../components/ChunkyButton';
import { Field } from '../components/Field';
import { HistorySection } from '../components/HistorySection';
import { PermissionRow } from '../components/PermissionRow';
import { plural } from '../format';
import { colors, fonts, stroke } from '../theme';

type Form = Omit<ForwarderConfig, 'enabled'>;

const SMS_PERMISSIONS = [PermissionsAndroid.PERMISSIONS.RECEIVE_SMS, PermissionsAndroid.PERMISSIONS.READ_SMS];

const PREVIEW_CONFIG: ForwarderConfig = {
  enabled: false,
  token: '',
  chatId: '',
  includeText: DEFAULT_INCLUDE_TEXT,
  excludeText: DEFAULT_EXCLUDE_TEXT,
  allowedSenders: '',
};

const toForm = ({ enabled: _enabled, ...form }: ForwarderConfig): Form => form;

const sameForm = (a: Form, b: Form) =>
  (Object.keys(a) as (keyof Form)[]).every((key) => a[key].trim() === b[key].trim());

function showPreviewAlert() {
  Alert.alert(
    'Vista previa',
    'Este build no incluye el módulo nativo de SMS (Expo Go o web). Para usar la app de verdad ejecuta: npx expo run:android'
  );
}

export function SettingsScreen() {
  const native = SmsForwarder;
  const [saved, setSaved] = useState<ForwarderConfig>(() => native?.getConfig() ?? PREVIEW_CONFIG);
  const [form, setForm] = useState<Form>(() => toForm(saved));
  const [history, setHistory] = useState<History | null>(() => native?.getHistory() ?? null);
  const [smsGranted, setSmsGranted] = useState<boolean | null>(null);
  const [smsBlocked, setSmsBlocked] = useState(false);
  const [batteryOk, setBatteryOk] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const dirty = !sameForm(form, toForm(saved));
  const active = !!native && saved.enabled && smsGranted === true;

  const refreshStatus = useCallback(async () => {
    if (!native || Platform.OS !== 'android') return;
    setHistory(native.getHistory());
    setBatteryOk(native.isIgnoringBatteryOptimizations());
    const checks = await Promise.all(SMS_PERMISSIONS.map((p) => PermissionsAndroid.check(p)));
    setSmsGranted(checks.every(Boolean));
  }, [native]);

  /** Al abrir la app o volver a ella: refrescar estado y buscar SMS de pago no interceptados. */
  const onForeground = useCallback(() => {
    refreshStatus();
    native?.checkMissedSms().catch(() => {});
  }, [native, refreshStatus]);

  useEffect(() => {
    onForeground();
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') onForeground();
    });
    const historySub = native?.addListener('onHistoryChanged', () => setHistory(native.getHistory()));
    return () => {
      appStateSub.remove();
      historySub?.remove();
    };
  }, [native, onForeground]);

  useEffect(() => {
    if (!savedNotice) return;
    const timer = setTimeout(() => setSavedNotice(false), 2500);
    return () => clearTimeout(timer);
  }, [savedNotice]);

  const update = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const requestSmsPermission = async () => {
    const result = await PermissionsAndroid.requestMultiple(SMS_PERMISSIONS);
    const values = Object.values(result);
    const granted = values.every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    setSmsGranted(granted);
    setSmsBlocked(values.some((v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN));
    if (granted) native?.checkMissedSms().catch(() => {});
  };

  const toggleEnabled = async (value: boolean) => {
    if (!native) return showPreviewAlert();
    if (value && (!saved.token || !saved.chatId)) {
      Alert.alert('Falta configurar Telegram', 'Guarda el token del bot y el chat ID antes de activar el reenvío.');
      return;
    }
    await native.saveConfig({ enabled: value });
    setSaved(native.getConfig());
    if (value && smsGranted === false) requestSmsPermission();
  };

  const save = async () => {
    if (!native) return showPreviewAlert();
    if (!form.includeText.trim()) {
      Alert.alert('Filtro vacío', 'El campo "El SMS contiene" no puede quedar vacío: se reenviarían todos los SMS.');
      return;
    }
    if (saved.enabled && (!form.token.trim() || !form.chatId.trim())) {
      Alert.alert('Falta configurar Telegram', 'Apaga el reenvío antes de borrar el token o el chat ID.');
      return;
    }
    setSaving(true);
    try {
      await native.saveConfig(form);
      const config = native.getConfig();
      setSaved(config);
      setForm(toForm(config));
      setSavedNotice(true);
    } catch (e) {
      Alert.alert('No se pudo guardar', String(e));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!native) return showPreviewAlert();
    if (!form.token.trim() || !form.chatId.trim()) {
      setTestResult({ ok: false, message: 'Escribe el token del bot y el chat ID.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const result = await native.sendTest(form.token, form.chatId);
      setTestResult(
        result.ok
          ? { ok: true, message: '¡Funcionó! Revisa el grupo de Telegram.' }
          : { ok: false, message: result.error ?? 'Error desconocido' }
      );
    } catch (e) {
      setTestResult({ ok: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const retryFailed = async () => {
    if (!native) return;
    setRetrying(true);
    try {
      await native.retryFailed();
      setHistory(native.getHistory());
    } finally {
      setRetrying(false);
    }
  };

  const checkInbox = async () => {
    if (!native) return showPreviewAlert();
    if (smsGranted === false) {
      Alert.alert('Falta el permiso de SMS', 'Concede el permiso de SMS para poder revisar la bandeja.');
      return;
    }
    if (!saved.enabled) {
      Alert.alert('Reenvío apagado', 'Solo se buscan SMS no interceptados mientras el reenvío está activo.');
      return;
    }
    setChecking(true);
    try {
      const recovered = await native.checkMissedSms();
      Alert.alert(
        'Revisión de la bandeja',
        recovered === 0
          ? 'Todo en orden: no hay SMS sin interceptar.'
          : `Se ${recovered === 1 ? 'encontró' : 'encontraron'} ${plural(recovered, 'SMS sin interceptar', 'SMS sin interceptar')}. Ya se procesaron.`
      );
    } finally {
      setChecking(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshStatus();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.red]} />}
        >
          <View style={styles.header}>
            <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
            <View style={styles.tagWrap}>
              <Text style={styles.tag}>Pagos</Text>
            </View>
          </View>

          {!native ? (
            <Card color={colors.goldSoft}>
              <Text style={styles.body}>
                Vista previa: este build no incluye el módulo nativo de SMS (Expo Go o web). Para usar la app de
                verdad ejecuta <Text style={styles.code}>npx expo run:android</Text>.
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
                  : !saved.enabled
                    ? 'El reenvío está apagado.'
                    : 'Falta el permiso de SMS.'}
            </Text>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Reenvío activo</Text>
              <Switch
                value={saved.enabled}
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
                    Si aparece bloqueado: Ajustes de la app → menú ⋮ → «Permitir ajustes restringidos», y luego
                    Permisos → SMS → Permitir.
                  </Text>
                  <ChunkyButton
                    label="Abrir ajustes de la app"
                    small
                    variant="white"
                    onPress={() => native?.openAppSettings()}
                  />
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
              En Xiaomi activa también «Inicio automático» y en Samsung agrega la app a «Apps que nunca se
              suspenden» (ver README).
            </Text>
          </Card>

          <HistorySection
            history={history}
            onRetryFailed={retryFailed}
            retrying={retrying}
            onCheckInbox={checkInbox}
            checking={checking}
          />

          <Card title="Telegram">
            <Field
              label="Token del bot"
              value={form.token}
              onChangeText={update('token')}
              placeholder="123456789:ABC..."
              secret
            />
            <Field
              label="Chat ID del grupo"
              value={form.chatId}
              onChangeText={update('chatId')}
              placeholder="-1001234567890"
              keyboardType="numbers-and-punctuation"
            />
            <ChunkyButton label="Enviar prueba" variant="gold" onPress={sendTest} loading={testing} />
            {testResult ? (
              <View style={[styles.result, { backgroundColor: testResult.ok ? colors.greenSoft : colors.redSoft }]}>
                <Text style={styles.body}>
                  {testResult.ok ? '✅ ' : '❌ '}
                  {testResult.message}
                </Text>
              </View>
            ) : null}
          </Card>

          <Card title="Filtros">
            <Field
              label="El SMS contiene"
              value={form.includeText}
              onChangeText={update('includeText')}
              hint="Sin distinguir mayúsculas ni tildes."
            />
            <Field
              label="Excluir si contiene"
              value={form.excludeText}
              onChangeText={update('excludeText')}
              hint="Separado por comas. Nunca se reenvían códigos de seguridad."
            />
            <Field
              label="Remitente permitido (opcional)"
              value={form.allowedSenders}
              onChangeText={update('allowedSenders')}
              placeholder="Vacío = cualquier remitente"
              hint="Número(s) que envían los SMS de Bancolombia, separados por comas. Evita que un SMS falso llegue al grupo. Cópialo del historial."
            />
          </Card>

          <View style={styles.saveRow}>
            <ChunkyButton label="Guardar" onPress={save} loading={saving} disabled={!dirty && !!native} />
            <Text style={[styles.saveHint, dirty && styles.saveHintDirty]}>
              {savedNotice ? '✓ Guardado' : dirty ? 'Tienes cambios sin guardar' : 'Todo guardado'}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: '100%',
    height: 190,
  },
  tagWrap: {
    marginTop: -6,
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
  code: {
    fontFamily: Platform.select({ android: 'monospace', default: undefined }),
    fontWeight: '700',
  },
  hint: {
    fontSize: 13,
    color: colors.muted,
  },
  result: {
    marginTop: 12,
    borderRadius: 14,
    padding: 12,
  },
  saveRow: {
    gap: 8,
  },
  saveHint: {
    textAlign: 'center',
    fontWeight: '700',
    color: colors.muted,
  },
  saveHintDirty: {
    color: colors.red,
  },
});
