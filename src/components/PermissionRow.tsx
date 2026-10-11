import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

type Props = {
  label: string;
  /** null mientras se consulta. */
  ok: boolean | null;
  okText: string;
  missingText: string;
  children?: ReactNode;
};

export function PermissionRow({ label, ok, okText, missingText, children }: Props) {
  const icon = ok === null ? '…' : ok ? '✅' : '⚠️';
  const status = ok === null ? 'Consultando…' : ok ? okText : missingText;

  return (
    <View style={[styles.row, ok === false && styles.rowMissing]}>
      <Text style={styles.icon}>{icon}</Text>
      <View style={styles.body}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.status, ok === false && styles.statusMissing]}>{status}</Text>
        {ok === false && children ? <View style={styles.actions}>{children}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: colors.greenSoft,
  },
  rowMissing: {
    backgroundColor: colors.redSoft,
  },
  icon: {
    fontSize: 20,
    lineHeight: 26,
  },
  body: {
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.dark,
  },
  status: {
    fontSize: 14,
    color: colors.dark,
    marginTop: 2,
  },
  statusMissing: {
    color: colors.red,
    fontWeight: '700',
  },
  actions: {
    marginTop: 10,
    gap: 8,
  },
});
