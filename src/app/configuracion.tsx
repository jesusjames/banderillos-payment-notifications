import { useNavigation } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import SmsForwarder, { type ForwarderConfig } from '../../modules/sms-forwarder';
import { Card } from '../components/Card';
import { ChunkyButton } from '../components/ChunkyButton';
import { Field } from '../components/Field';
import { Screen } from '../components/Screen';
import { readConfig, showPreviewAlert } from '../hooks/useForwarder';
import { colors } from '../theme';

type Form = Omit<ForwarderConfig, 'enabled'>;

const toForm = ({ enabled: _enabled, ...form }: ForwarderConfig): Form => form;

const sameForm = (a: Form, b: Form) =>
  (Object.keys(a) as (keyof Form)[]).every((key) => a[key].trim() === b[key].trim());

export default function ConfigScreen() {
  const native = SmsForwarder;
  const navigation = useNavigation();
  const [saved, setSaved] = useState<ForwarderConfig>(readConfig);
  const [form, setForm] = useState<Form>(() => toForm(saved));
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const dirty = !sameForm(form, toForm(saved));

  // Avisar antes de salir con cambios sin guardar (botón atrás o flecha del encabezado).
  useEffect(() => {
    if (!dirty) return;
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
      Alert.alert('Cambios sin guardar', '¿Quieres salir sin guardar los cambios?', [
        { text: 'Seguir editando', style: 'cancel' },
        { text: 'Salir sin guardar', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
  }, [navigation, dirty]);

  useEffect(() => {
    if (!savedNotice) return;
    const timer = setTimeout(() => setSavedNotice(false), 2500);
    return () => clearTimeout(timer);
  }, [savedNotice]);

  const update = (key: keyof Form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

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
      const config = readConfig();
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

  return (
    <Screen>
      <Card title="Telegram">
        <Field label="Token del bot" value={form.token} onChangeText={update('token')} placeholder="123456789:ABC..." secret />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 15,
    color: colors.dark,
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
