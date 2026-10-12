// Estas librerías llegan como dependencias indirectas de expo-router (react-native-drawer-layout y @expo/ui),
// pero la app no las usa: el Stack es nativo (react-native-screens), no hay animaciones de Reanimated y
// @expo/ui carga worklets solo si existe (require dentro de try/catch).
// Se excluyen del autolinking de Android porque:
//  - react-native-gesture-handler: en Windows su código C++ genera rutas de más de 260 caracteres.
//  - react-native-worklets / react-native-reanimated: su configuración C++ falla con el JDK 25 y la versión
//    que instala npm (worklets 0.13) no es la que espera expo-modules-core.
// Si algún día se usa un Drawer, el Stack de JS o animaciones con Reanimated, hay que quitar esto.
const notOnAndroid = { platforms: { android: null } };

module.exports = {
  dependencies: {
    'react-native-gesture-handler': notOnAndroid,
    'react-native-reanimated': notOnAndroid,
    'react-native-worklets': notOnAndroid,
  },
};
