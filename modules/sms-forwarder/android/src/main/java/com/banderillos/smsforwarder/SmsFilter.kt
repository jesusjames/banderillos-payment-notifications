package com.banderillos.smsforwarder

import java.security.MessageDigest
import java.text.Normalizer

/** Decide si un SMS se reenvía. Compara sin mayúsculas ni tildes ("código" == "codigo"). */
internal object SmsFilter {
  sealed class Decision {
    object Forward : Decision()
    data class Ignore(val reason: String) : Decision()
  }

  private val DIACRITICS = "\\p{Mn}+".toRegex()
  private val WHITESPACE = "\\s+".toRegex()

  fun normalize(text: String): String =
    Normalizer.normalize(text, Normalizer.Form.NFD)
      .replace(DIACRITICS, "")
      .replace(WHITESPACE, " ")
      .lowercase()
      .trim()

  fun splitList(raw: String): List<String> =
    raw.split(',', ';', '\n').map { it.trim() }.filter { it.isNotEmpty() }

  fun decide(config: ForwarderConfig, sender: String, body: String): Decision {
    if (!config.enabled) return Decision.Ignore("Reenvío desactivado")

    val allowed = splitList(config.allowedSenders)
    if (allowed.isNotEmpty() && allowed.none { senderMatches(it, sender) }) {
      return Decision.Ignore("Remitente no permitido")
    }

    val text = normalize(body)
    val include = normalize(config.includeText)
    // Un filtro vacío reenviaría todos los SMS personales: se trata como "no reenviar".
    if (include.isEmpty()) return Decision.Ignore("El filtro \"El SMS contiene\" está vacío")
    if (!text.contains(include)) return Decision.Ignore("No contiene el filtro")

    val excluded = splitList(config.excludeText).firstOrNull { text.contains(normalize(it)) }
    if (excluded != null) return Decision.Ignore("Contiene \"$excluded\" (excluido)")

    return Decision.Forward
  }

  /** "87400", "+57 300 123 4567" y "573001234567" se comparan solo por letras y dígitos. */
  fun senderMatches(allowed: String, sender: String): Boolean {
    val a = allowed.filter { it.isLetterOrDigit() }.lowercase()
    val b = sender.filter { it.isLetterOrDigit() }.lowercase()
    if (a.isEmpty() || b.isEmpty()) return false
    if (a == b) return true
    // Tolera el prefijo de país (+57) en uno de los dos lados.
    val (longer, shorter) = if (a.length >= b.length) a to b else b to a
    return shorter.length >= 5 && longer.length - shorter.length <= 3 && longer.endsWith(shorter)
  }

  /** Huella del contenido para saber si un SMS de la bandeja ya pasó por el receiver. */
  fun fingerprint(body: String): String {
    val compact = normalize(body).replace(" ", "")
    val digest = MessageDigest.getInstance("SHA-256").digest(compact.toByteArray(Charsets.UTF_8))
    return digest.take(12).joinToString("") { "%02x".format(it) }
  }
}
