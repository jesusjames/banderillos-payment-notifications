#!/usr/bin/env node
// Configuración de firma, una sola vez por PC:
//   1. crea keystore/banderillos-release.jks (la llave con la que se firma la app)
//   2. agrega las credenciales a ~/.gradle/gradle.properties (fuera del repo)
// Nunca sobrescribe un keystore ni credenciales existentes.
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWindows = process.platform === 'win32';
const KEYSTORE_RELATIVE = 'keystore/banderillos-release.jks';
const KEY_ALIAS = 'banderillos';
const keystorePath = join(root, KEYSTORE_RELATIVE);
const gradleHome = process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle');
const gradleProperties = join(gradleHome, 'gradle.properties');

function fail(message) {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

// Una sola interfaz para todas las preguntas; lo que se escribe no se muestra (contraseñas).
const interactive = Boolean(process.stdin.isTTY);
let rl;
let lines;
let muted = false;

async function askHidden(question) {
  if (!rl) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });
    rl._writeToOutput = (text) => {
      if (!muted) rl.output.write(text);
    };
    lines = rl[Symbol.asyncIterator]();
  }
  process.stdout.write(question);
  muted = true;
  const { value } = await lines.next();
  muted = false;
  process.stdout.write('\n');
  return value ?? '';
}

function findKeytool() {
  const exe = isWindows ? 'keytool.exe' : 'keytool';
  if (process.env.JAVA_HOME && existsSync(join(process.env.JAVA_HOME, 'bin', exe))) {
    return join(process.env.JAVA_HOME, 'bin', exe);
  }
  return 'keytool';
}

// 1. No pisar nada existente
if (existsSync(keystorePath)) {
  fail(`Ya existe ${KEYSTORE_RELATIVE}. No se sobrescribe: si lo reemplazas no podrás actualizar la app instalada.`);
}
const existingProps = existsSync(gradleProperties) ? readFileSync(gradleProperties, 'utf8') : '';
if (/^\s*BANDERILLOS_UPLOAD_/m.test(existingProps)) {
  fail(`${gradleProperties} ya tiene credenciales BANDERILLOS_UPLOAD_*. Revísalas a mano antes de crear otro keystore.`);
}

// 2. Contraseña (keytool exige mínimo 6 caracteres)
console.log('\nCreando la llave de firma de Banderillos Pagos.');
console.log('Elige una contraseña y GUÁRDALA: sin ella no se pueden publicar actualizaciones.\n');
const password = await askHidden('Contraseña (no se muestra al escribir): ');
if (password.length < 6) fail('La contraseña debe tener al menos 6 caracteres.');
const confirmation = await askHidden('Repite la contraseña: ');
rl.close();
if (password !== confirmation) fail('Las contraseñas no coinciden.');

// 3. Crear el keystore (la contraseña va por variable de entorno, no en la línea de comandos)
mkdirSync(dirname(keystorePath), { recursive: true });
const keytool = findKeytool();
const result = spawnSync(
  keytool,
  [
    '-genkeypair',
    '-storetype', 'PKCS12',
    '-keystore', keystorePath,
    '-alias', KEY_ALIAS,
    '-keyalg', 'RSA',
    '-keysize', '2048',
    '-validity', '10000',
    '-dname', 'CN=Banderillos, O=Banderillos, L=Neiva, C=CO',
    '-storepass:env', 'BANDERILLOS_KS_PASS',
    '-keypass:env', 'BANDERILLOS_KS_PASS',
  ],
  { env: { ...process.env, BANDERILLOS_KS_PASS: password }, encoding: 'utf8' }
);
if (result.error) fail(`No se encontró keytool (viene con el JDK). Revisa JAVA_HOME. ${result.error.message}`);
if (result.status !== 0) fail(`keytool falló:\n${result.stderr || result.stdout}`);

// 4. Credenciales en gradle.properties (formato .properties: la barra invertida se escapa)
const escaped = password.replace(/\\/g, '\\\\');
mkdirSync(gradleHome, { recursive: true });
const separator = existingProps && !existingProps.endsWith('\n') ? '\n' : '';
appendFileSync(
  gradleProperties,
  `${separator}
# Firma de release de Banderillos Pagos (creado por npm run setup:keystore)
BANDERILLOS_UPLOAD_STORE_FILE=${KEYSTORE_RELATIVE}
BANDERILLOS_UPLOAD_STORE_PASSWORD=${escaped}
BANDERILLOS_UPLOAD_KEY_ALIAS=${KEY_ALIAS}
BANDERILLOS_UPLOAD_KEY_PASSWORD=${escaped}
`
);

console.log(`
✅ Listo.
   Keystore:     ${keystorePath}
   Credenciales: ${gradleProperties}

⚠️  RESPALDA AHORA el archivo ${KEYSTORE_RELATIVE} y la contraseña fuera de este PC
   (gestor de contraseñas, USB). Si se pierden, no podrás actualizar la app del celular de Juan
   sin desinstalarla y perder su configuración.

Siguiente paso:  npm run build:apk
`);
