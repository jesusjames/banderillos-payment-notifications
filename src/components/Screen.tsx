import { ReactNode, useState } from 'react';
import { KeyboardAvoidingView, RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';

type Props = {
  children: ReactNode;
  /** Pantallas sin encabezado (el inicio) necesitan el margen de la barra de estado. */
  topInset?: boolean;
  onRefresh?: () => void | Promise<void>;
};

/** Contenedor con scroll, fondo crema, márgenes seguros y "jalar para refrescar". */
export function Screen({ children, topInset, onRefresh }: Props) {
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    // El margen superior va en el contenedor (no en el contenido) para que al hacer scroll nada pase por
    // debajo de la barra de estado.
    <KeyboardAvoidingView style={[styles.flex, topInset && { paddingTop: insets.top }]} behavior="padding">
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.content, { paddingTop: 16, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} colors={[colors.red]} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  content: {
    paddingHorizontal: 16,
  },
});
