package com.banderillos.smsforwarder

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class ConfigInput : Record {
  @Field val enabled: Boolean? = null
  @Field val token: String? = null
  @Field val chatId: String? = null
  @Field val includeText: String? = null
  @Field val excludeText: String? = null
  @Field val allowedSenders: String? = null
}

class SmsForwarderModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("SmsForwarder")

    Events("onHistoryChanged")

    OnStartObserving("onHistoryChanged") {
      HistoryStore.listener = { sendEvent("onHistoryChanged", mapOf<String, Any?>()) }
    }

    OnStopObserving("onHistoryChanged") {
      HistoryStore.listener = null
    }

    Function("getConfig") {
      val config = ConfigStore.load(context, withToken = true)
      mapOf(
        "enabled" to config.enabled,
        "token" to config.token,
        "chatId" to config.chatId,
        "includeText" to config.includeText,
        "excludeText" to config.excludeText,
        "allowedSenders" to config.allowedSenders
      )
    }

    AsyncFunction("saveConfig") { input: ConfigInput ->
      ConfigStore.update(
        context,
        enabled = input.enabled,
        token = input.token,
        chatId = input.chatId,
        includeText = input.includeText,
        excludeText = input.excludeText,
        allowedSenders = input.allowedSenders
      )
      Forwarder.syncMissedCheck(context, ConfigStore.load(context).enabled)
      ForwarderService.sync(context)
    }

    AsyncFunction("sendTest") Coroutine { token: String, chatId: String ->
      withContext(Dispatchers.IO) {
        when (val result = TelegramClient.sendMessage(token.trim(), chatId.trim(), "✅ Prueba desde Banderillos Pagos")) {
          is TelegramClient.Result.Sent -> mapOf("ok" to true, "error" to null)
          is TelegramClient.Result.Failed -> mapOf("ok" to false, "error" to result.message)
        }
      }
    }

    Function("getHistory") {
      HistoryStore.snapshot(context)
    }

    AsyncFunction("retryFailed") {
      Forwarder.retryFailed(context)
    }

    /** Busca en la bandeja SMS de pago que no se interceptaron. Devuelve cuántos recuperó. */
    AsyncFunction("checkMissedSms") {
      val recovered = MissedSmsChecker.run(context)
      // Asegura que la revisión periódica y el servicio fijo sigan activos (p. ej. tras actualizar la app
      // o si la detuvieron a la fuerza: abrirla vuelve a levantar todo).
      Forwarder.syncMissedCheck(context, ConfigStore.load(context).enabled)
      ForwarderService.sync(context)
      recovered
    }

    Function("isIgnoringBatteryOptimizations") {
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("openBatteryOptimizationSettings") {
      @SuppressLint("BatteryLife")
      val direct = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        .setData(Uri.parse("package:${context.packageName}"))
      if (!startActivitySafely(direct)) {
        startActivitySafely(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
      }
    }

    Function("openAppSettings") {
      startActivitySafely(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).setData(Uri.parse("package:${context.packageName}"))
      )
    }
  }

  private fun startActivitySafely(intent: Intent): Boolean {
    val activity = appContext.currentActivity
    return try {
      if (activity != null) {
        activity.startActivity(intent)
      } else {
        context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      true
    } catch (e: Exception) {
      false
    }
  }
}
