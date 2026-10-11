import { LilitaOne_400Regular, useFonts } from '@expo-google-fonts/lilita-one';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import SmsForwarder from '../../modules/sms-forwarder';
import { colors, fonts } from '../theme';

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ LilitaOne_400Regular });

  // Al abrir la app y cada vez que vuelve al frente: buscar SMS de pago que no se interceptaron.
  useEffect(() => {
    const check = () => SmsForwarder?.checkMissedSms().catch(() => {});
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, []);

  // Si la fuente falla, se sigue con la del sistema.
  if (!fontsLoaded && !fontError) return null;

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.cream },
          headerTintColor: colors.dark,
          headerTitleStyle: { fontFamily: fonts.title, fontSize: 24 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.cream },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false, title: 'Inicio' }} />
        <Stack.Screen name="historial" options={{ title: 'Historial de hoy' }} />
        <Stack.Screen name="configuracion" options={{ title: 'Configuración' }} />
      </Stack>
    </>
  );
}
