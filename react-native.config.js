// react-native-gesture-handler llega como dependencia indirecta de expo-router (vía react-native-drawer-layout),
// pero la app no lo usa: el Stack es nativo (react-native-screens) y el bundle no lo importa.
// Se excluye del autolinking de Android porque en Windows su código C++ genera rutas de más de
// 260 caracteres y rompe la compilación. Si algún día se usa un Drawer o el Stack de JS, hay que quitar esto.
module.exports = {
  dependencies: {
    'react-native-gesture-handler': {
      platforms: { android: null },
    },
  },
};
