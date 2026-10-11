package com.banderillos.smsforwarder

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

internal object Forwarder {
  private const val MISSED_CHECK_WORK = "missed-sms-check"

  /** Punto de entrada común del receiver y de la recuperación desde la bandeja. */
  fun handleIncoming(context: Context, sender: String, body: String, receivedAt: Long, recovered: Boolean) {
    if (!recovered && !HistoryStore.markReceived(context, SmsFilter.fingerprint(body))) {
      HistoryStore.addIgnored(context, sender, "Ya se había recuperado de la bandeja")
      return
    }

    val config = ConfigStore.load(context)
    when (val decision = SmsFilter.decide(config, sender, body)) {
      is SmsFilter.Decision.Ignore -> {
        Log.i(TAG, "SMS de $sender ignorado: ${decision.reason}")
        HistoryStore.addIgnored(context, sender, decision.reason)
      }
      SmsFilter.Decision.Forward -> {
        Log.i(TAG, "SMS de pago de $sender ${if (recovered) "recuperado" else "interceptado"}, en cola para Telegram")
        val entry = HistoryStore.addEntry(context, sender, body, receivedAt, recovered)
        enqueueSend(context, entry)
      }
    }
  }

  fun enqueueSend(context: Context, entry: HistoryEntry, replace: Boolean = false) {
    try {
      val request = OneTimeWorkRequestBuilder<TelegramWorker>()
        .setInputData(TelegramWorker.inputFor(entry))
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
        .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
        .build()
      WorkManager.getInstance(context).enqueueUniqueWork(
        "send-${entry.id}",
        if (replace) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP,
        request
      )
    } catch (e: Exception) {
      Log.e(TAG, "No se pudo programar el envío", e)
      HistoryStore.update(context, entry) {
        it.copy(status = HistoryStore.FAILED, error = "No se pudo programar el envío: ${e.message}")
      }
    }
  }

  /** Vuelve a poner en cola los envíos fallidos de hoy. Devuelve cuántos. */
  fun retryFailed(context: Context): Int {
    val failed = HistoryStore.entries(context).filter { it.status == HistoryStore.FAILED }
    for (entry in failed) {
      HistoryStore.update(context, entry) { it.copy(status = HistoryStore.PENDING, attempts = 0, error = null) }
      enqueueSend(context, entry, replace = true)
    }
    return failed.size
  }

  /** Revisión periódica (cada 15 min, el mínimo de Android) de SMS de pago no interceptados. */
  fun syncMissedCheck(context: Context, enabled: Boolean) {
    val workManager = WorkManager.getInstance(context)
    if (enabled) {
      val request = PeriodicWorkRequestBuilder<MissedSmsWorker>(15, TimeUnit.MINUTES).build()
      workManager.enqueueUniquePeriodicWork(MISSED_CHECK_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    } else {
      workManager.cancelUniqueWork(MISSED_CHECK_WORK)
    }
  }
}
