// Config plugin: permite compilar con el JDK 25 (el mismo que usan los otros proyectos de este PC).
// Android Gradle Plugin ejecuta la herramienta "prefab" al configurar el código C++. Su versión por
// defecto (2.1.0) carga JNA, y desde el JDK 24 Java imprime "WARNING: A restricted method in
// java.lang.System has been called"; AGP toma esa advertencia como error y el build falla.
// prefab 2.0.0 no usa JNA y es compatible con los paquetes de React Native/Expo.
const { withGradleProperties } = require('expo/config-plugins');

const PREFAB_VERSION = '2.0.0';

module.exports = function withJdk25Support(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === 'android.prefabVersion'));
    props.push(
      { type: 'comment', value: 'prefab sin JNA para compilar con JDK 24+ (ver plugins/withJdk25Support.js)' },
      { type: 'property', key: 'android.prefabVersion', value: PREFAB_VERSION }
    );
    cfg.modResults = props;
    return cfg;
  });
};
