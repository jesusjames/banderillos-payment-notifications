import { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, fonts, radius, shadowOffset, stroke } from '../theme';

type Props = {
  title?: string;
  right?: ReactNode;
  color?: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/** Tarjeta redondeada con borde grueso y sombra sólida desplazada, como un sticker. */
export function Card({ title, right, color = colors.white, style, children }: Props) {
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.shadow} />
      <View style={[styles.card, { backgroundColor: color }]}>
        {title ? (
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            {right}
          </View>
        ) : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 20,
    marginRight: shadowOffset,
  },
  shadow: {
    position: 'absolute',
    top: shadowOffset,
    left: shadowOffset,
    right: -shadowOffset,
    bottom: -shadowOffset,
    borderRadius: radius.card,
    backgroundColor: colors.dark,
  },
  card: {
    borderWidth: stroke,
    borderColor: colors.dark,
    borderRadius: radius.card,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  title: {
    fontFamily: fonts.title,
    fontSize: 22,
    color: colors.dark,
    flexShrink: 1,
  },
});
