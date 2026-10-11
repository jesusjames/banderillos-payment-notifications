import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts, stroke } from '../theme';

type Variant = 'red' | 'gold' | 'white';

type Props = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  small?: boolean;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

const OFFSET = 3;

const backgrounds: Record<Variant, string> = {
  red: colors.red,
  gold: colors.gold,
  white: colors.white,
};

/** Botón grueso con sombra sólida; al presionarlo "se hunde". */
export function ChunkyButton({ label, onPress, variant = 'red', small, disabled, loading, style }: Props) {
  const inactive = disabled || loading;
  const textColor = variant === 'red' ? colors.white : colors.dark;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      style={[styles.wrap, inactive && styles.inactive, style]}
    >
      {({ pressed }) => (
        <>
          <View style={styles.shadow} />
          <View
            style={[
              styles.button,
              small && styles.small,
              { backgroundColor: backgrounds[variant] },
              pressed && { transform: [{ translateX: OFFSET }, { translateY: OFFSET }] },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={textColor} />
            ) : (
              <Text style={[styles.label, small && styles.labelSmall, { color: textColor }]}>{label}</Text>
            )}
          </View>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginRight: OFFSET,
    marginBottom: OFFSET,
  },
  inactive: {
    opacity: 0.5,
  },
  shadow: {
    position: 'absolute',
    top: OFFSET,
    left: OFFSET,
    right: -OFFSET,
    bottom: -OFFSET,
    borderRadius: 14,
    backgroundColor: colors.dark,
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: stroke,
    borderColor: colors.dark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  small: {
    minHeight: 38,
    paddingHorizontal: 12,
  },
  label: {
    fontFamily: fonts.title,
    fontSize: 18,
    textAlign: 'center',
  },
  labelSmall: {
    fontSize: 15,
  },
});
