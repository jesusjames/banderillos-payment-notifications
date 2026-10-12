package com.banderillos.smsforwarder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log

/**
 * Lo despierta Android con cada SMS entrante, aunque la app esté cerrada o la pantalla apagada.
 * Solo filtra, guarda en el historial y pone el envío en cola: el POST lo hace TelegramWorker.
 */
class SmsReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
    val app = context.applicationContext
    val receivedAt = System.currentTimeMillis()

    val messages = try {
      Telephony.Sms.Intents.getMessagesFromIntent(intent)
    } catch (e: Exception) {
      Log.e(TAG, "No se pudo leer el SMS entrante", e)
      HistoryStore.addIgnored(app, "desconocido", "Error al leer el SMS: ${e.message}", isError = true)
      return
    }
    if (messages.isNullOrEmpty()) return

    // Un SMS largo llega en varias partes: se unen por remitente, en orden, antes de filtrar.
    val bodies = LinkedHashMap<String, StringBuilder>()
    for (part in messages) {
      if (part == null) continue
      val sender = part.displayOriginatingAddress ?: part.originatingAddress ?: "desconocido"
      bodies.getOrPut(sender) { StringBuilder() }.append(part.displayMessageBody ?: part.messageBody.orEmpty())
    }

    for ((sender, body) in bodies) {
      try {
        Forwarder.handleIncoming(app, sender, body.toString(), receivedAt, recovered = false)
      } catch (e: Exception) {
        Log.e(TAG, "Error procesando SMS de $sender", e)
        HistoryStore.addIgnored(app, sender, "Error al procesar el SMS: ${e.message}", isError = true)
      }
    }

    // Si el servicio fijo se había caído, se levanta de nuevo aprovechando que la app está despierta.
    ForwarderService.sync(app)
  }
}
