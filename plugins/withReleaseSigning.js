// Config plugin: firma el build de release con el keystore propio en vez del de debug.
// Las credenciales NO están en el repo: se leen de ~/.gradle/gradle.properties o de variables
// de entorno (BANDERILLOS_UPLOAD_STORE_FILE, _STORE_PASSWORD, _KEY_ALIAS, _KEY_PASSWORD).
// Se aplica en cada `expo prebuild`, porque la carpeta android/ se regenera.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// banderillos-release-signing';

const RELEASE_SIGNING_CONFIG = `
        ${MARKER}
        release {
            def signingProp = { String name -> (project.findProperty(name) ?: System.getenv(name))?.toString() }
            def storePath = signingProp('BANDERILLOS_UPLOAD_STORE_FILE')
            if (storePath) {
                // Ruta absoluta o relativa a la raiz del proyecto (la carpeta que contiene android/).
                def keystoreFile = new File(storePath)
                if (!keystoreFile.isAbsolute()) keystoreFile = new File(project.rootDir.parentFile, storePath)
                storeFile keystoreFile
                storePassword signingProp('BANDERILLOS_UPLOAD_STORE_PASSWORD')
                keyAlias signingProp('BANDERILLOS_UPLOAD_KEY_ALIAS')
                keyPassword signingProp('BANDERILLOS_UPLOAD_KEY_PASSWORD')
            }
        }`;

function addReleaseSigning(buildGradle) {
  if (buildGradle.includes(MARKER)) return buildGradle;

  const withConfig = buildGradle.replace(/signingConfigs\s*\{/, (match) => `${match}${RELEASE_SIGNING_CONFIG}`);
  const withBuildType = withConfig.replace(
    /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
    '$1signingConfig signingConfigs.release'
  );

  if (withConfig === buildGradle || withBuildType === withConfig) {
    throw new Error('withReleaseSigning: no se encontró el bloque de firma esperado en android/app/build.gradle');
  }
  return withBuildType;
}

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: solo soporta build.gradle en Groovy');
    }
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
};
