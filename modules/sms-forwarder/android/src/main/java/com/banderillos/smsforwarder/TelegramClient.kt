package com.banderillos.smsforwarder

import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.MalformedURLException
import java.net.URL

internal object TelegramClient {
  sealed class Result {
    data class Sent(val messageId: Long) : Result()
    data class Failed(val message: String, val retryable: Boolean) : Result()
  }

  /** POST https://api.telegram.org/bot<TOKEN>/sendMessage con {"chat_id", "text"}. Bloqueante. */
  fun sendMessage(token: String, chatId: String, text: String): Result {
    var connection: HttpURLConnection? = null
    return try {
      val url = URL("https://api.telegram.org/bot$token/sendMessage")
      val payload = JSONObject().put("chat_id", chatId).put("text", text).toString()
      connection = (url.openConnection() as HttpURLConnection).apply {
        requestMethod = "POST"
        connectTimeout = 15_000
        readTimeout = 20_000
        doOutput = true
        setRequestProperty("Content-Type", "application/json; charset=utf-8")
      }
      connection.outputStream.use { it.write(payload.toByteArray(Charsets.UTF_8)) }

      val code = connection.responseCode
      // Con errores HTTP se lee errorStream: inputStream lanzaría una excepción con la URL (y el token).
      val stream = if (code in 200..299) connection.inputStream else connection.errorStream
      val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
      val json = runCatching { JSONObject(body) }.getOrNull()

      if (code in 200..299 && json?.optBoolean("ok") == true) {
        Result.Sent(json.optJSONObject("result")?.optLong("message_id") ?: 0L)
      } else {
        val description = json?.optString("description")?.takeIf { it.isNotBlank() } ?: "sin detalle"
        val migrateTo = json?.optJSONObject("parameters")?.optLong("migrate_to_chat_id", 0L) ?: 0L
        val message = buildString {
          append("Telegram $code: $description")
          if (migrateTo != 0L) append(" (el grupo cambió de chat ID: usa $migrateTo)")
        }
        // 429 (demasiadas solicitudes) y 5xx son temporales. 400/401/403/404 son de configuración.
        Result.Failed(message, retryable = code == 429 || code >= 500)
      }
    } catch (e: MalformedURLException) {
      Result.Failed("El token del bot no es válido", retryable = false)
    } catch (e: IOException) {
      Result.Failed("Sin conexión con Telegram (${sanitize(e, token)})", retryable = true)
    } catch (e: Exception) {
      Result.Failed("Error inesperado: ${sanitize(e, token)}", retryable = true)
    } finally {
      connection?.disconnect()
    }
  }

  /** Nunca dejar el token en mensajes que se muestran o se guardan. */
  private fun sanitize(e: Exception, token: String): String {
    val message = e.message ?: e.javaClass.simpleName
    return if (token.isNotEmpty()) message.replace(token, "***") else message
  }
}
