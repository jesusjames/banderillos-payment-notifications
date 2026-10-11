#!/usr/bin/env node
// Genera el APK de release firmado, 100 % local (sin EAS):
//   1. verifica keystore, Android SDK y Java
//   2. expo prebuild limpio (regenera android/)
//   3. gradlew assembleRelease
//   4. copia el APK a dist/banderillos-pagos-v<versión>.apk
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const env = { ...process.env };

const SIGNING_KEYS = [
  'BANDERILLOS_UPLOAD_STORE_FILE',
  'BANDERILLOS_UPLOAD_STORE_PASSWORD',
  'BANDERILLOS_UPLOAD_KEY_ALIAS',
  'BANDERILLOS_UPLOAD_KEY_PASSWORD',
];

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function step(message) {
  console.log(`\n▶ ${message}`);
}

function run(command, args, cwd = root) {
  // En Windows npx y gradlew son .cmd/.bat: necesitan shell (y con shell se pasa una sola línea).
  const result = isWindows
    ? spawnSync([command, ...args].join(' '), { cwd, env, stdio: 'inherit', shell: true })
    : spawnSync(command, args, { cwd, env, stdio: 'inherit' });
  if (result.status !== 0) fail(`Falló: ${command} ${args.join(' ')}`);
}

function readGradleProperties(file) {
  if (!existsSync(file)) return {};
  const props = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#!=\s]+)\s*[=:]\s*(.*)$/);
    if (match) props[match[1]] = match[2].trim();
  }
  return props;
}

function javaMajorVersion() {
  const javaBin = env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', isWindows ? 'java.exe' : 'java') : 'java';
  const result = spawnSync(javaBin, ['-version'], { encoding: 'utf8' });
  const match = `${result.stderr ?? ''}${result.stdout ?? ''}`.match(/version "(\d+)(?:\.(\d+))?/);
  if (!match) return null;
  return match[1] === '1' ? Number(match[2]) : Number(match[1]);
}

// 1. Firma
step('Verificando keystore de firma');
const gradleHome = env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
const userProps = readGradleProperties(join(gradleHome, 'gradle.properties'));
const signing = Object.fromEntries(SIGNING_KEYS.map((key) => [key, env[key] ?? userProps[key]]));
const missing = SIGNING_KEYS.filter((key) => !signing[key]);
if (missing.length > 0) {
  fail(
    `Faltan credenciales de firma: ${missing.join(', ')}.\n` +
      `   Agrégalas a ${join(gradleHome, 'gradle.properties')} o como variables de entorno.\n` +
      '   Ver README → "Generar el APK".'
  );
}
const storeFile = isAbsolute(signing.BANDERILLOS_UPLOAD_STORE_FILE)
  ? signing.BANDERILLOS_UPLOAD_STORE_FILE
  : join(root, signing.BANDERILLOS_UPLOAD_STORE_FILE);
if (!existsSync(storeFile)) fail(`No existe el keystore: ${storeFile}`);
console.log(`  Keystore: ${storeFile}`);

// 2. Android SDK
if (!env.ANDROID_HOME && !env.ANDROID_SDK_ROOT) {
  const guess = isWindows
    ? join(env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
    : process.platform === 'darwin'
      ? join(homedir(), 'Library', 'Android', 'sdk')
      : join(homedir(), 'Android', 'Sdk');
  if (!existsSync(guess)) fail('No se encontró el Android SDK. Define la variable ANDROID_HOME.');
  env.ANDROID_HOME = guess;
}
console.log(`  Android SDK: ${env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT}`);

// 3. Java
const javaMajor = javaMajorVersion();
if (javaMajor === null || javaMajor < 17 || javaMajor > 21) {
  fail(
    `Se necesita JDK 17 (encontrado: ${javaMajor ?? 'ninguno'}).\n` +
      '   Apunta JAVA_HOME a un JDK 17 antes de compilar. Ver README → "Requisitos".'
  );
}
console.log(`  Java: ${javaMajor}`);

// 4. Proyecto nativo limpio
step('Generando el proyecto nativo (expo prebuild)');
rmSync(join(root, 'android'), { recursive: true, force: true });
run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install']);

// 5. Compilar
step('Compilando el APK de release (gradlew assembleRelease)');
// Ruta absoluta: cmd.exe no siempre busca ejecutables en la carpeta actual.
const androidDir = join(root, 'android');
const gradlew = join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');
run(isWindows ? `"${gradlew}"` : gradlew, ['assembleRelease'], androidDir);

// 6. Copiar a dist/
const version = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')).expo.version;
const builtApk = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(builtApk)) fail(`No se encontró el APK generado en ${builtApk}`);
const distDir = join(root, 'dist');
mkdirSync(distDir, { recursive: true });
const output = join(distDir, `banderillos-pagos-v${version}.apk`);
copyFileSync(builtApk, output);

console.log(`\n✅ APK listo: ${relative(root, output)}\n`);
