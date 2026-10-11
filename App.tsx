import { LilitaOne_400Regular, useFonts } from '@expo-google-fonts/lilita-one';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { SettingsScreen } from './src/screens/SettingsScreen';

export default function App() {
  const [fontsLoaded, fontError] = useFonts({ LilitaOne_400Regular });

  // Si la fuente falla, se sigue con la del sistema.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <SettingsScreen />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
