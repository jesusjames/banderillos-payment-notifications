package com.banderillos.smsforwarder

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat

/**
 * Servicio en primer plano con el aviso fijo "Reenviando pagos" mientras el reenvío está activo.
 * Con él Android trata la app como en uso: no la detiene cuando el cajero la cierra o la quita de
 * recientes, y el receiver de SMS sigue despertándose (igual que hace MacroDroid).
 * No hace trabajo propio: el SMS lo procesa SmsReceiver y el envío TelegramWorker.
 */
class ForwarderService : Service() {

  companion object {
    private const val CHANNEL_ID = "forwarding_status"
    private const val NOTIFICATION_ID = 4520

    /** Arranca o detiene el servicio según "Reenvío activo". Seguro de llamar varias veces. */
    fun sync(context: Context) {
      val app = context.applicationContext
      val intent = Intent(app, ForwarderService::class.java)
      if (ConfigStore.load(app).enabled) {
        try {
          ContextCompat.startForegroundService(app, intent)
        } catch (e: Exception) {
          // Android 12+ no deja iniciarlo desde segundo plano si la app no está exenta de la
          // optimización de batería; se reintenta al abrir la app o al llegar el próximo SMS.
          Log.w(TAG, "No se pudo iniciar el servicio de reenvío: ${e.message}")
        }
      } else {
        app.stopService(intent)
      }
    }
  }

  /** true en el primer arranque de esta instancia (abrir la app, reinicio, tras ser detenida). */
  private var freshStart = true

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // startForeground debe llamarse siempre tras startForegroundService, incluso si luego se detiene.
    try {
      val type = if (Build.VERSION.SDK_INT >= 34) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0
      ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)
    } catch (e: Exception) {
      Log.e(TAG, "No se pudo poner el servicio en primer plano", e)
      stopSelf()
      return START_NOT_STICKY
    }

    if (!ConfigStore.load(this).enabled) {
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      stopSelf()
      return START_NOT_STICKY
    }

    // Si el servicio acaba de arrancar pudo haber SMS mientras estaba caído: se buscan en la bandeja.
    if (freshStart) {
      freshStart = false
      Forwarder.checkMissedSoon(this)
      Forwarder.syncMissedCheck(this, enabled = true)
    }
    // Si Android mata el proceso por falta de memoria, lo vuelve a crear apenas pueda.
    return START_STICKY
  }

  private fun buildNotification() = run {
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Reenvío de pagos activo", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Aviso fijo mientras Banderillos Pagos reenvía los SMS de pago a Telegram"
          setShowBadge(false)
        }
      )
    }
    val openApp = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_forwarding)
      .setContentTitle("Reenviando pagos")
      .setContentText("Los SMS de transferencias se envían al grupo de Telegram.")
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setContentIntent(openApp)
      .build()
  }
}
