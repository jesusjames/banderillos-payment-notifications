import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors, radius } from '../theme';

type Props = {
  label: string;
  hint?: string;
  value: string;
  onChangeText: (text: string) => void;
  /** Campo tipo contraseña con botón para mostrar/ocultar. */
  secret?: boolean;
} & Pick<TextInputProps, 'placeholder' | 'keyboardType' | 'multiline'>;

export function Field({ label, hint, value, onChangeText, secret, ...inputProps }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secret && !visible}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor={colors.muted}
          style={[styles.input, secret && styles.inputWithToggle]}
          {...inputProps}
        />
        {secret ? (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            style={styles.toggle}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar' : 'Mostrar'}
          >
            <Text style={styles.toggleText}>{visible ? 'Ocultar' : 'Mostrar'}</Text>
          </Pressable>
        ) : null}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.dark,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  input: {
    flex: 1,
    backgroundColor: colors.cream,
    borderWidth: 2.5,
    borderColor: colors.dark,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.dark,
  },
  inputWithToggle: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  toggle: {
    justifyContent: 'center',
    paddingHorizontal: 12,
    backgroundColor: colors.gold,
    borderWidth: 2.5,
    borderLeftWidth: 0,
    borderColor: colors.dark,
    borderTopRightRadius: radius.control,
    borderBottomRightRadius: radius.control,
  },
  toggleText: {
    fontWeight: '800',
    color: colors.dark,
  },
  hint: {
    marginTop: 4,
    fontSize: 13,
    color: colors.muted,
  },
});
