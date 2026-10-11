import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, PermissionsAndroid, Platform } from 'react-native';

import SmsForwarder, {
  DEFAULT_EXCLUDE_TEXT,
  DEFAULT_INCLUDE_TEXT,
  type ForwarderConfig,
  type History,
} from '../../modules/sms-forwarder';

export const SMS_PERMISSIONS = [PermissionsAndroid.PERMISSIONS.RECEIVE_SMS, PermissionsAndroid.PERMISSIONS.READ_SMS];

const PREVIEW_CONFIG: ForwarderConfig = {
  enabled: false,
  token: '',
  chatId: '',
  includeText: DEFAULT_INCLUDE_TEXT,
  excludeText: DEFAULT_EXCLUDE_TEXT,
  allowedSenders: '',
};

export const readConfig = (): ForwarderConfig => SmsForwarder?.getConfig() ?? PREVIEW_CONFIG;

export function showPreviewAlert() {
  Alert.alert(
    'Vista previa',
    'Este build no incluye el módulo nativo de SMS (Expo Go o web). Para usar la app de verdad ejecuta: npx expo run:android'
  );
}

/** Acciones sobre el historial: reintentar fallidos y revisar la bandeja. */
export function useHistoryActions(onDone: () => void) {
  const [retrying, setRetrying] = useState(false);
  const [checking, setChecking] = useState(false);

  const retryFailed = async () => {
    if (!SmsForwarder) return showPreviewAlert();
    setRetrying(true);
    try {
      await SmsForwarder.retryFailed();
      onDone();
    } finally {
      setRetrying(false);
    }
  };

  const checkInbox = async () => {
    if (!SmsForwarder) return showPreviewAlert();
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    if (!granted) {
      Alert.alert('Falta el permiso de SMS', 'Concede el permiso de SMS en el inicio para poder revisar la bandeja.');
      return;
    }
    if (!readConfig().enabled) {
      Alert.alert('Reenvío apagado', 'Solo se buscan SMS no interceptados mientras el reenvío está activo.');
      return;
    }
    setChecking(true);
    try {
      const recovered = await SmsForwarder.checkMissedSms();
      onDone();
      Alert.alert(
        'Revisión de la bandeja',
        recovered === 0
          ? 'Todo en orden: no hay SMS sin interceptar.'
          : `Se ${recovered === 1 ? 'encontró 1 SMS' : `encontraron ${recovered} SMS`} sin interceptar. Ya se procesaron.`
      );
    } finally {
      setChecking(false);
    }
  };

  return { retrying, retryFailed, checking, checkInbox };
}

/** Historial del día; se refresca al enfocar la pantalla, al volver a la app y con cada cambio nativo. */
export function useHistory() {
  const [history, setHistory] = useState<History | null>(() => SmsForwarder?.getHistory() ?? null);

  const refresh = useCallback(() => {
    if (SmsForwarder) setHistory(SmsForwarder.getHistory());
  }, []);

  useFocusEffect(refresh);

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const historySub = SmsForwarder?.addListener('onHistoryChanged', refresh);
    return () => {
      appStateSub.remove();
      historySub?.remove();
    };
  }, [refresh]);

  return { history, refresh };
}

/** Configuración guardada y estado de permisos; se refresca al enfocar la pantalla o volver a la app. */
export function useForwarderStatus() {
  const [config, setConfig] = useState<ForwarderConfig>(readConfig);
  const [smsGranted, setSmsGranted] = useState<boolean | null>(null);
  const [smsBlocked, setSmsBlocked] = useState(false);
  const [batteryOk, setBatteryOk] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    setConfig(readConfig());
    if (!SmsForwarder || Platform.OS !== 'android') return;
    setBatteryOk(SmsForwarder.isIgnoringBatteryOptimizations());
    const checks = await Promise.all(SMS_PERMISSIONS.map((p) => PermissionsAndroid.check(p)));
    setSmsGranted(checks.every(Boolean));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const requestSmsPermission = useCallback(async () => {
    const result = await PermissionsAndroid.requestMultiple(SMS_PERMISSIONS);
    const values = Object.values(result);
    const granted = values.every((v) => v === PermissionsAndroid.RESULTS.GRANTED);
    setSmsGranted(granted);
    setSmsBlocked(values.some((v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN));
    if (granted) SmsForwarder?.checkMissedSms().catch(() => {});
    return granted;
  }, []);

  return { config, setConfig, smsGranted, smsBlocked, batteryOk, refresh, requestSmsPermission };
}
