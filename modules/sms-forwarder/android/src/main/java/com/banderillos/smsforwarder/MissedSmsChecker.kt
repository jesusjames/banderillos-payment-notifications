package com.banderillos.smsforwarder

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.provider.Telephony
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

data class InboxSms(val address: String, val body: String, val date: Long)

/**
 * Red de seguridad: si el sistema no despertó al receiver (ahorro de batería agresivo,
 * app forzada a detenerse…), el SMS igual queda en la bandeja. Aquí se buscan los SMS
 * recientes que el receiver nunca vio y se procesan como "recuperados".
 */
internal object MissedSmsChecker {
  /** Margen para no competir con el receiver mientras el SMS recién llega. */
  private const val GRACE_MS = 5L * 60 * 1000
  private const val WINDOW_MS = 24L * 60 * 60 * 1000

  @Synchronized
  fun run(context: Context): Int {
    val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.READ_SMS) ==
      PackageManager.PERMISSION_GRANTED
    if (!granted) return 0

    val config = ConfigStore.load(context)
    if (!config.enabled) return 0

    val now = System.currentTimeMillis()
    val from = maxOf(config.enabledSince, now - WINDOW_MS)
    val to = now - GRACE_MS
    if (from >= to) return 0

    val inbox = mutableListOf<InboxSms>()
    try {
      context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        arrayOf(Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE),
        "${Telephony.Sms.DATE} > ? AND ${Telephony.Sms.DATE} <= ?",
        arrayOf(from.toString(), to.toString()),
        "${Telephony.Sms.DATE} ASC"
      )?.use { cursor ->
        while (cursor.moveToNext()) {
          inbox += InboxSms(
            address = cursor.getString(0) ?: "desconocido",
            body = cursor.getString(1).orEmpty(),
            date = cursor.getLong(2)
          )
        }
      }
    } catch (e: Exception) {
      Log.e(TAG, "No se pudo leer la bandeja de SMS", e)
      HistoryStore.addIgnored(context, "—", "No se pudo revisar la bandeja: ${e.message}", isError = true)
      return 0
    }

    val missed = HistoryStore.claimMissed(context, inbox)
    for (sms in missed) {
      Log.w(TAG, "SMS de ${sms.address} no fue interceptado a tiempo; se recupera de la bandeja")
      Forwarder.handleIncoming(context, sms.address, sms.body, sms.date, recovered = true)
    }
    return missed.size
  }
}

class MissedSmsWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    MissedSmsChecker.run(applicationContext)
    Result.success()
  }
}
