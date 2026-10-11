package com.banderillos.smsforwarder

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Envía un SMS a Telegram. WorkManager lo ejecuta solo con internet y lo reintenta con
 * espera exponencial; sobrevive a reinicios del teléfono.
 * El token NO viaja en los datos del trabajo (la base de WorkManager no está cifrada):
 * se lee y descifra justo antes de enviar.
 */
class TelegramWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

  companion object {
    private const val MAX_ATTEMPTS = 15
    private const val K_ID = "id"
    private const val K_SENDER = "sender"
    private const val K_TEXT = "text"
    private const val K_RECEIVED_AT = "receivedAt"
    private const val K_RECOVERED = "recovered"
    private const val CHANNEL_ID = "telegram_sends"
    private const val NOTIFICATION_ID = 4521

    fun inputFor(entry: HistoryEntry): Data = workDataOf(
      K_ID to entry.id,
      K_SENDER to entry.sender,
      K_TEXT to entry.text,
      K_RECEIVED_AT to entry.receivedAt,
      K_RECOVERED to entry.recovered
    )

    private fun entryFrom(data: Data): HistoryEntry? {
      val id = data.getString(K_ID) ?: return null
      return HistoryEntry(
        id = id,
        receivedAt = data.getLong(K_RECEIVED_AT, System.currentTimeMillis()),
        sender = data.getString(K_SENDER).orEmpty(),
        text = data.getString(K_TEXT).orEmpty(),
        status = HistoryStore.PENDING,
        attempts = 0,
        error = null,
        sentAt = null,
        recovered = data.getBoolean(K_RECOVERED, false)
      )
    }
  }

  override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
    val entry = entryFrom(inputData) ?: return@withContext Result.failure()
    val attempt = runAttemptCount + 1
    val config = ConfigStore.load(applicationContext, withToken = true)

    if (config.token.isEmpty() || config.chatId.isEmpty()) {
      markFailed(entry, attempt, "Falta configurar el token del bot o el chat ID")
      return@withContext Result.failure()
    }

    when (val result = TelegramClient.sendMessage(config.token, config.chatId, entry.text)) {
      is TelegramClient.Result.Sent -> {
        Log.i(TAG, "Pago reenviado a Telegram (intento $attempt)")
        HistoryStore.update(applicationContext, entry) {
          it.copy(status = HistoryStore.SENT, attempts = attempt, error = null, sentAt = System.currentTimeMillis())
        }
        Result.success()
      }
      is TelegramClient.Result.Failed -> {
        if (result.retryable && attempt < MAX_ATTEMPTS) {
          Log.w(TAG, "Envío falló (intento $attempt), se reintentará: ${result.message}")
          HistoryStore.update(applicationContext, entry) {
            it.copy(status = HistoryStore.RETRYING, attempts = attempt, error = result.message)
          }
          Result.retry()
        } else {
          markFailed(entry, attempt, result.message)
          Result.failure()
        }
      }
    }
  }

  private fun markFailed(entry: HistoryEntry, attempt: Int, message: String) {
    Log.e(TAG, "Envío fallido definitivamente (intento $attempt): $message")
    HistoryStore.update(applicationContext, entry) {
      it.copy(status = HistoryStore.FAILED, attempts = attempt, error = message)
    }
  }

  /** En Android 11 o anterior, el trabajo "urgente" corre como servicio en primer plano y requiere notificación. */
  override suspend fun getForegroundInfo(): ForegroundInfo {
    val manager = applicationContext.getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Envíos a Telegram", NotificationManager.IMPORTANCE_LOW)
      )
    }
    val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_sys_upload)
      .setContentTitle("Banderillos Pagos")
      .setContentText("Enviando pago a Telegram…")
      .setOngoing(true)
      .build()
    return ForegroundInfo(NOTIFICATION_ID, notification)
  }
}
