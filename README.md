# Banderillos Pagos

App Android que intercepta los SMS de transferencias de Bancolombia que llegan al celular
de Juan y los reenvía **tal cual** al grupo de Telegram del negocio mediante un bot.
Reemplaza la macro de MacroDroid.

- Funciona con la app cerrada, en segundo plano y con la pantalla apagada (receiver nativo).
- Si no hay internet, el pago queda en cola y se envía cuando vuelve la conexión.
- Nunca reenvía códigos de seguridad (filtro "Excluir si contiene").
- Todo es local: sin backend, sin base de datos, sin EAS. La única llamada externa es a la API de Telegram.
- Historial del día actual: qué SMS se interceptaron y si cada envío a Telegram salió bien o falló.

## Cómo funciona

```
SMS entrante ──► SmsReceiver (Kotlin, declarado en el manifest)
                  │  une las partes de un SMS largo
                  │  aplica filtros: contiene / excluir / remitente
                  ├─ no coincide ──► "SMS no reenviados" (solo remitente y motivo, sin texto)
                  └─ coincide ─────► historial "⏳ En cola" ──► WorkManager (requiere red, reintentos)
                                                                   └─► POST api.telegram.org/bot<TOKEN>/sendMessage
                                                                        ├─ ✅ Enviado
                                                                        └─ ❌ Falló (con el error de Telegram)

Cada 15 min y al abrir la app: se revisa la bandeja de SMS buscando pagos que el receiver
no alcanzó a interceptar (p. ej. si el sistema mató la app). Esos se reenvían marcados como
"Recuperado de la bandeja".
```

## Requisitos (PC de desarrollo)

- Node.js 20 o superior.
- **JDK 17**. Si tienes varios JDK, apunta `JAVA_HOME` al 17 en la terminal antes de compilar:
  - PowerShell: `$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17.0.18.8-hotspot"`
  - bash: `export JAVA_HOME=/ruta/al/jdk-17`
- Android SDK (se instala con Android Studio). Si `ANDROID_HOME` no está definido, el script del
  APK usa la ruta por defecto (`%LOCALAPPDATA%\Android\Sdk` en Windows).

```bash
npm install
```

## Desarrollo

La app usa código nativo propio (el receiver de SMS), así que **no funciona en Expo Go**: se usa un
development build local.

```bash
npx expo run:android
```

Esto genera la carpeta `android/`, compila e instala la app en el emulador o en el celular conectado.
La carpeta `android/` es generada (no se sube al repo); la configuración nativa vive en `app.json`,
en `plugins/` y en el módulo local `modules/sms-forwarder/`.

Si solo quieres ver la interfaz (`npx expo start` con Expo Go), la pantalla abre en
**modo vista previa**: muestra un aviso y desactiva las acciones nativas en lugar de fallar.

Comandos útiles:

```bash
npm run typecheck
```

```bash
adb logcat -s BanderillosPagos
```

## Configurar Telegram

### 1. Crear el bot y obtener el token (@BotFather)

1. En Telegram abre **@BotFather** y envía `/newbot`.
2. Escribe un nombre (p. ej. `Banderillos Pagos`) y un usuario terminado en `bot`
   (p. ej. `banderillos_pagos_bot`).
3. BotFather responde con el **token**, algo como `123456789:AAH...`. Guárdalo: es la contraseña
   del bot. No lo compartas ni lo subas al repo.
4. Agrega el bot al grupo de Telegram del negocio.

### 2. Obtener el chat_id del grupo (getUpdates)

1. En el grupo, envía un mensaje mencionando al bot, por ejemplo `/start@banderillos_pagos_bot`
   (por defecto los bots en grupos solo reciben comandos y menciones).
2. En el navegador abre (cambiando `<TOKEN>`):
   `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Busca `"chat":{"id":-100xxxxxxxxxx, ... "type":"supergroup"}`. Ese número **negativo** es el
   chat_id.
4. Si sale `"result":[]`, envía otro mensaje al grupo y recarga. Si sigue vacío, saca y vuelve a
   agregar el bot.

> Si Telegram convierte el grupo en "supergrupo", el chat_id cambia. La app mostrará el error con
> el nuevo chat_id para que lo actualices.

### 3. En la app

En el inicio toca **Abrir configuración**. Pega el token y el chat_id, toca **Enviar prueba** (debe
llegar "✅ Prueba desde Banderillos Pagos" al grupo) y luego **Guardar**. Vuelve al inicio y activa
**Reenvío activo**.

## Generar el APK (sin EAS)

### 1. Crear el keystore (una sola vez)

El keystore es la llave con la que se firma la app. `keytool` viene con el JDK.

```bash
mkdir keystore
```

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore keystore/banderillos-release.jks -alias banderillos -keyalg RSA -keysize 2048 -validity 10000
```

Te pedirá una contraseña y unos datos (nombre, organización…). La carpeta `keystore/` y los
archivos `.jks`/`.keystore` están en `.gitignore`: **nunca** se suben al repo.

### 2. Respaldar el keystore (importante)

Android solo deja **actualizar** una app si el APK nuevo está firmado con la misma llave. Si pierdes
el keystore o su contraseña, para instalar una versión nueva habrá que desinstalar la app del
celular de Juan, lo que borra la configuración (token, chat_id, filtros) y el historial.

Guarda una copia de `keystore/banderillos-release.jks` **y** de las contraseñas en un lugar seguro
fuera del PC (gestor de contraseñas, USB guardada). No en el repo ni en una carpeta compartida.

### 3. Credenciales de firma

Agrega esto a `~/.gradle/gradle.properties` (en Windows:
`C:\Users\<tu-usuario>\.gradle\gradle.properties`; créalo si no existe). Ese archivo está fuera del
repo:

```properties
BANDERILLOS_UPLOAD_STORE_FILE=keystore/banderillos-release.jks
BANDERILLOS_UPLOAD_STORE_PASSWORD=tu-contraseña
BANDERILLOS_UPLOAD_KEY_ALIAS=banderillos
BANDERILLOS_UPLOAD_KEY_PASSWORD=tu-contraseña
```

También sirven variables de entorno con los mismos nombres. Una ruta relativa en
`BANDERILLOS_UPLOAD_STORE_FILE` se toma desde la raíz del proyecto.

### 4. Compilar

```bash
npm run build:apk
```

El script verifica keystore, Android SDK y Java, regenera `android/` (`expo prebuild`), ejecuta
`gradlew assembleRelease` y deja el APK en:

```
dist/banderillos-pagos-v<versión>.apk
```

Para publicar una actualización, sube `version` y `android.versionCode` en `app.json` antes de
compilar.

> **¿Por qué un script y no un comando de Expo?** El único comando de Expo que entrega el archivo
> APK es EAS Build, que compila en la nube (o con `eas-cli` y una cuenta de Expo) y este proyecto es
> 100 % local. Para compilar sin EAS, Expo indica justamente `npx expo prebuild` + `gradlew
> assembleRelease`; `scripts/build-apk.mjs` solo encadena esos dos pasos, funciona igual en Windows
> y Mac/Linux, revisa antes keystore, SDK y Java, y copia el APK a `dist/`. Si lo que quieres es
> instalar directo en un celular conectado, usa el comando de Expo `npm run android:release`
> (ver "Instalar el APK").

## Instalar el APK en el celular de Juan

No se publica en Play Store (Google restringe el permiso de SMS); el APK se instala directamente.

### Opción A: por cable (recomendada)

1. En el celular: Ajustes → Acerca del teléfono → toca 7 veces **Número de compilación**.
2. Ajustes → Opciones de desarrollador → activa **Depuración USB**.
3. Conecta el cable, acepta el aviso en el celular y ejecuta:

```bash
adb install -r dist/banderillos-pagos-v1.0.0.apk
```

O, sin generar antes el APK, deja que Expo compile la versión release firmada y la instale en el
celular conectado (usa las mismas credenciales de firma):

```bash
npm run android:release
```

Instalando por cable no aparece el bloqueo de "ajustes restringidos".

### Opción B: compartiendo el archivo

1. Envía el APK al celular (WhatsApp, Drive, cable USB…).
2. Ábrelo y permite **Instalar apps desconocidas** para la app desde la que lo abriste.
3. Si Play Protect avisa, toca **Más detalles → Instalar de todas formas**.
4. En Android 13 o superior, el permiso de SMS puede aparecer bloqueado. Ve a Ajustes → Apps →
   Banderillos Pagos → menú **⋮** → **Permitir ajustes restringidos**, y luego concede el permiso.

## Permisos y batería

En la app, tarjeta **Permisos**:

1. **Conceder permiso de SMS** → Permitir. (RECEIVE_SMS para recibir; READ_SMS para buscar en la
   bandeja los pagos que no se alcanzaron a interceptar.)
2. **Ignorar optimización de batería** → Permitir.

Los fabricantes agregan sus propios ahorradores de batería que pueden impedir que Android despierte
la app. Los nombres de los menús cambian según la versión.

### Samsung (One UI)

- Ajustes → Apps → Banderillos Pagos → Batería → **Sin restricciones**.
- Ajustes → Batería → Límites de uso en segundo plano → **Apps que nunca se suspenden** → agregar
  Banderillos Pagos. Verifica que no esté en "Apps en suspensión" ni en "Apps en suspensión profunda".

### Xiaomi / Redmi / POCO (MIUI / HyperOS)

- Ajustes → Apps → Administrar apps → Banderillos Pagos → **Inicio automático**: activado.
- En la misma pantalla → Ahorro de batería → **Sin restricciones**.
- Permisos de la app → **Otros permisos** → **SMS de notificación** (o "Leer SMS de notificación"):
  Permitir. MIUI trata los SMS de bancos como "de notificación" y sin este permiso la app no los ve.
- Opcional: en Recientes, mantén presionada la app y bloquéala con el candado.

Más detalles por fabricante: https://dontkillmyapp.com

## Probar en el emulador

Con la app instalada (`npx expo run:android`), token y chat_id guardados y el reenvío activo:

```bash
adb emu sms send 87400 'Bancolombia: JUAN, recibiste una transferencia de YULI FERNANDA FLOREZ CUELLAR por $23,000.00 en tu cuenta *5221 conectada a la llave 1082215639 el 30/09/26 a las 17:45. Con llaves es de una y gratis. Dudas al 018000912345.'
```

Usa comillas **simples** (en PowerShell y en bash las dobles convierten `$23` en una variable).
Este mensaje supera los 160 caracteres, así que llega en varias partes: sirve para probar que se
unen antes de filtrar.

Otras pruebas:

- Código de seguridad (no debe reenviarse; aparece en "SMS no reenviados"):

```bash
adb emu sms send 87400 'Bancolombia: tu clave dinamica es 123456. No la compartas.'
```

- Sin internet: apaga Wi-Fi y datos del emulador, envía el SMS de pago (queda "⏳ En cola"), vuelve
  a encender la red y debe pasar a "✅ Enviado".

## Pantallas

- **Inicio**: estado del reenvío, permisos, resumen de los pagos de hoy y acceso a la configuración.
- **Historial de hoy** (botón "Ver historial completo"): el detalle de cada pago y los SMS no reenviados.
- **Configuración**: token, chat_id, prueba y filtros. Si sales con cambios sin guardar, la app avisa.

## Historial

- Solo se guarda el **día actual**; al cambiar de fecha se borra el anterior.
- Cada pago interceptado muestra hora, remitente, el texto (toca para verlo completo) y el estado:
  ⏳ En cola · 🔁 Reintentando · ✅ Enviado · ❌ Falló (con el error de Telegram).
- **Reintentar fallidos** vuelve a enviar los que fallaron (p. ej. después de corregir el token).
- **SMS no reenviados**: SMS que no pasaron el filtro y errores al interceptar. Solo se guarda el
  remitente y el motivo, nunca el texto.
- **Buscar SMS no interceptados** revisa la bandeja en ese momento (también se hace sola cada 15
  minutos y al abrir la app).

## Seguridad

- El token del bot se guarda cifrado con una llave del Android Keystore. No está en el código, ni en
  el repo, ni en la cola de envíos.
- **Remitente permitido** (recomendado): el filtro por texto lo cumple cualquier SMS que diga
  "recibiste una transferencia de", incluso uno falso enviado desde otro celular. Después del
  primer pago real, copia el remitente que aparece en el historial a este campo para que solo se
  reenvíen los SMS de ese número.

## Solución de problemas

| Error en el historial | Causa |
| --- | --- |
| `Telegram 401: Unauthorized` / `404: Not Found` | Token incorrecto. |
| `Telegram 400: Bad Request: chat not found` | chat_id incorrecto o el bot no está en el grupo. |
| `... upgraded to a supergroup chat (... usa -100...)` | El grupo cambió de chat_id: usa el nuevo. |
| `Telegram 403: Forbidden: bot was kicked` | Vuelve a agregar el bot al grupo. |
| `Sin conexión con Telegram` | Sin internet; se reintenta solo. |

- **No aparece nada en el historial**: revisa los permisos, la batería y, en Xiaomi, "SMS de
  notificación". Si el banco envía el mensaje como chat RCS (burbuja con logo verificado en
  Mensajes) en lugar de SMS, Android no avisa a otras apps.
- Cuando confirmes que la app funciona, **desactiva la macro de MacroDroid** para no recibir cada
  pago dos veces en el grupo.

## Estructura

```
├─ app.json                       # nombre, package, ícono, plugins
├─ react-native.config.js         # excluye react-native-gesture-handler del enlace nativo (ver comentario)
├─ src/
│  ├─ app/                        # rutas (Expo Router)
│  │  ├─ _layout.tsx              # fuente, encabezados y revisión de SMS al abrir la app
│  │  ├─ index.tsx                # inicio
│  │  ├─ historial.tsx            # historial de hoy
│  │  └─ configuracion.tsx        # Telegram y filtros
│  ├─ components/                 # Card, ChunkyButton, Field, Screen, HistorySummary, HistoryList…
│  ├─ hooks/useForwarder.ts       # estado compartido: configuración, permisos, historial
│  ├─ history.ts / theme.ts / format.ts
├─ modules/sms-forwarder/         # módulo local de Expo Modules (autolinked)
│  ├─ index.ts                    # API para JS (null si no hay módulo nativo)
│  └─ android/src/main/
│     ├─ AndroidManifest.xml      # permisos + receiver SMS_RECEIVED
│     └─ java/com/banderillos/smsforwarder/
│        ├─ SmsReceiver.kt        # recibe y filtra los SMS
│        ├─ TelegramWorker.kt     # envío con WorkManager (red + reintentos)
│        ├─ TelegramClient.kt     # POST a la API de Telegram
│        ├─ MissedSmsChecker.kt   # busca pagos no interceptados en la bandeja
│        ├─ HistoryStore.kt       # historial del día
│        ├─ ConfigStore.kt        # configuración en SharedPreferences
│        ├─ TokenCipher.kt        # cifrado del token (Android Keystore)
│        └─ SmsForwarderModule.kt # puente con JS
├─ plugins/withReleaseSigning.js  # firma de release desde gradle.properties / variables de entorno
└─ scripts/build-apk.mjs          # npm run build:apk
```
