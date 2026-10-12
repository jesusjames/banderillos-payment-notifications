package com.banderillos.smsforwarder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/** Vuelve a activar el reenvío al encender el celular o al actualizar la app, sin que haya que abrirla. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      "android.intent.action.QUICKBOOT_POWERON" -> {
        Log.i(TAG, "Reactivando el reenvío (${intent.action})")
        ForwarderService.sync(context)
      }
    }
  }
}
