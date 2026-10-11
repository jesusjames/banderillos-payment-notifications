package com.banderillos.smsforwarder

import android.content.Context
import android.content.SharedPreferences

internal const val TAG = "BanderillosPagos"

data class ForwarderConfig(
  val enabled: Boolean,
  /** Solo viene lleno si se pidió con `withToken = true`. */
  val token: String,
  val hasToken: Boolean,
  val chatId: String,
  val includeText: String,
  val excludeText: String,
  val allowedSenders: String,
  /** Momento en que se activó el reenvío por última vez. Los SMS anteriores nunca se recuperan. */
  val enabledSince: Long
)

/** Configuración guardada en SharedPreferences. La escribe la app (JS) mediante el módulo nativo. */
internal object ConfigStore {
  const val DEFAULT_INCLUDE = "recibiste una transferencia de"
  const val DEFAULT_EXCLUDE = "clave, código, OTP"

  private const val PREFS = "banderillos_config"
  private const val K_ENABLED = "enabled"
  private const val K_TOKEN = "token_encrypted"
  private const val K_CHAT_ID = "chat_id"
  private const val K_INCLUDE = "include_text"
  private const val K_EXCLUDE = "exclude_text"
  private const val K_ALLOWED = "allowed_senders"
  private const val K_ENABLED_SINCE = "enabled_since"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun load(context: Context, withToken: Boolean = false): ForwarderConfig {
    val p = prefs(context)
    val encryptedToken = p.getString(K_TOKEN, null)
    return ForwarderConfig(
      enabled = p.getBoolean(K_ENABLED, false),
      token = if (withToken) TokenCipher.decrypt(encryptedToken) else "",
      hasToken = !encryptedToken.isNullOrEmpty(),
      chatId = p.getString(K_CHAT_ID, "").orEmpty(),
      includeText = p.getString(K_INCLUDE, DEFAULT_INCLUDE).orEmpty(),
      excludeText = p.getString(K_EXCLUDE, DEFAULT_EXCLUDE).orEmpty(),
      allowedSenders = p.getString(K_ALLOWED, "").orEmpty(),
      enabledSince = p.getLong(K_ENABLED_SINCE, 0L)
    )
  }

  /** Actualiza solo los campos que no son null. */
  @Synchronized
  fun update(
    context: Context,
    enabled: Boolean? = null,
    token: String? = null,
    chatId: String? = null,
    includeText: String? = null,
    excludeText: String? = null,
    allowedSenders: String? = null
  ) {
    val p = prefs(context)
    val wasEnabled = p.getBoolean(K_ENABLED, false)
    val editor = p.edit()
    enabled?.let {
      editor.putBoolean(K_ENABLED, it)
      if (it && !wasEnabled) editor.putLong(K_ENABLED_SINCE, System.currentTimeMillis())
    }
    token?.let {
      val clean = it.trim()
      if (clean.isEmpty()) editor.remove(K_TOKEN) else editor.putString(K_TOKEN, TokenCipher.encrypt(clean))
    }
    chatId?.let { editor.putString(K_CHAT_ID, it.trim()) }
    includeText?.let { editor.putString(K_INCLUDE, it.trim()) }
    excludeText?.let { editor.putString(K_EXCLUDE, it.trim()) }
    allowedSenders?.let { editor.putString(K_ALLOWED, it.trim()) }
    editor.commit()
  }
}
