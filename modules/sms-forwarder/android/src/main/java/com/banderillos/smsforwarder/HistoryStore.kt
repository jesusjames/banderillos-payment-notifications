package com.banderillos.smsforwarder

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID

/** Un SMS de pago interceptado y el estado de su envío a Telegram. */
data class HistoryEntry(
  val id: String,
  val receivedAt: Long,
  val sender: String,
  val text: String,
  val status: String,
  val attempts: Int,
  val error: String?,
  val sentAt: Long?,
  /** true si el receiver no lo interceptó y se recuperó leyendo la bandeja de SMS. */
  val recovered: Boolean
)

/**
 * Historial SOLO del día actual: al cambiar la fecha se borra el del día anterior.
 * Además guarda huellas (hash, sin texto) de los SMS vistos en las últimas 48 h para
 * detectar SMS que el receiver no alcanzó a interceptar.
 */
internal object HistoryStore {
  const val PENDING = "pending"
  const val RETRYING = "retrying"
  const val SENT = "sent"
  const val FAILED = "failed"

  private const val PREFS = "banderillos_history"
  private const val SEEN_PREFS = "banderillos_seen"
  private const val K_DAY = "day"
  private const val K_ENTRIES = "entries"
  private const val K_IGNORED = "ignored"
  private const val K_SEEN = "seen"
  private const val MAX_ENTRIES = 300
  private const val MAX_IGNORED = 200
  private const val SEEN_TTL_MS = 48L * 60 * 60 * 1000

  /** Lo registra el módulo mientras la app está abierta para refrescar la pantalla. */
  @Volatile
  var listener: (() -> Unit)? = null

  private val lock = Any()

  private fun today(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

  private fun prefs(context: Context): SharedPreferences {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val day = today()
    if (p.getString(K_DAY, null) != day) {
      p.edit().putString(K_DAY, day).remove(K_ENTRIES).remove(K_IGNORED).commit()
    }
    return p
  }

  private fun readArray(p: SharedPreferences, key: String): JSONArray =
    runCatching { JSONArray(p.getString(key, "[]")) }.getOrDefault(JSONArray())

  private fun writeArray(p: SharedPreferences, key: String, array: JSONArray, max: Int) {
    val trimmed = if (array.length() <= max) array else JSONArray().also { out ->
      for (i in array.length() - max until array.length()) out.put(array.get(i))
    }
    p.edit().putString(key, trimmed.toString()).commit()
  }

  private fun notifyChanged() {
    try {
      listener?.invoke()
    } catch (_: Exception) {
    }
  }

  // ---- Pagos interceptados ----

  fun addEntry(context: Context, sender: String, text: String, receivedAt: Long, recovered: Boolean): HistoryEntry {
    val entry = HistoryEntry(
      id = UUID.randomUUID().toString(),
      receivedAt = receivedAt,
      sender = sender,
      text = text,
      status = PENDING,
      attempts = 0,
      error = null,
      sentAt = null,
      recovered = recovered
    )
    synchronized(lock) {
      val p = prefs(context)
      val entries = readArray(p, K_ENTRIES).put(entry.toJson())
      writeArray(p, K_ENTRIES, entries, MAX_ENTRIES)
    }
    notifyChanged()
    return entry
  }

  /** Actualiza una entrada. Si ya no existe (el envío terminó después de medianoche), la vuelve a agregar. */
  fun update(context: Context, base: HistoryEntry, change: (HistoryEntry) -> HistoryEntry) {
    synchronized(lock) {
      val p = prefs(context)
      val entries = readArray(p, K_ENTRIES)
      var found = false
      for (i in 0 until entries.length()) {
        val current = entryFromJson(entries.getJSONObject(i))
        if (current.id == base.id) {
          entries.put(i, change(current).toJson())
          found = true
          break
        }
      }
      if (!found) entries.put(change(base).toJson())
      writeArray(p, K_ENTRIES, entries, MAX_ENTRIES)
    }
    notifyChanged()
  }

  fun entries(context: Context): List<HistoryEntry> = synchronized(lock) {
    val entries = readArray(prefs(context), K_ENTRIES)
    (0 until entries.length()).map { entryFromJson(entries.getJSONObject(it)) }
  }

  // ---- SMS ignorados y errores de intercepción (sin guardar el texto) ----

  fun addIgnored(context: Context, sender: String, reason: String, isError: Boolean = false) {
    synchronized(lock) {
      val p = prefs(context)
      val ignored = readArray(p, K_IGNORED).put(
        JSONObject()
          .put("at", System.currentTimeMillis())
          .put("sender", sender)
          .put("reason", reason)
          .put("isError", isError)
      )
      writeArray(p, K_IGNORED, ignored, MAX_IGNORED)
    }
    notifyChanged()
  }

  /** Lo que ve la pantalla: lo más reciente primero. */
  fun snapshot(context: Context): Map<String, Any?> = synchronized(lock) {
    val p = prefs(context)
    val entries = readArray(p, K_ENTRIES)
    val ignored = readArray(p, K_IGNORED)
    mapOf(
      "day" to p.getString(K_DAY, today()),
      "entries" to (entries.length() - 1 downTo 0).map { entryFromJson(entries.getJSONObject(it)).toMap() },
      "ignored" to (ignored.length() - 1 downTo 0).map { i ->
        val o = ignored.getJSONObject(i)
        mapOf(
          "at" to o.optLong("at").toDouble(),
          "sender" to o.optString("sender"),
          "reason" to o.optString("reason"),
          "isError" to o.optBoolean("isError")
        )
      }
    )
  }

  // ---- Huellas de SMS vistos (para detectar SMS no interceptados) ----

  private fun loadSeen(context: Context): Pair<SharedPreferences, MutableList<JSONObject>> {
    val p = context.getSharedPreferences(SEEN_PREFS, Context.MODE_PRIVATE)
    val array = readArray(p, K_SEEN)
    val minTime = System.currentTimeMillis() - SEEN_TTL_MS
    val list = (0 until array.length()).map { array.getJSONObject(it) }.filter { it.optLong("t") >= minTime }
    return p to list.toMutableList()
  }

  private fun saveSeen(p: SharedPreferences, list: List<JSONObject>) {
    p.edit().putString(K_SEEN, JSONArray(list).toString()).commit()
  }

  /**
   * Registra que el receiver vio un SMS. Devuelve false si ese SMS ya había sido recuperado
   * desde la bandeja (el receiver llegó tarde), para no reenviarlo dos veces.
   */
  fun markReceived(context: Context, fingerprint: String): Boolean = synchronized(lock) {
    val (p, seen) = loadSeen(context)
    val recovered = seen.firstOrNull {
      it.optString("h") == fingerprint && it.optBoolean("r") && !it.optBoolean("c")
    }
    if (recovered != null) {
      recovered.put("c", true)
      saveSeen(p, seen)
      return@synchronized false
    }
    seen += seenJson(fingerprint, recovered = false)
    saveSeen(p, seen)
    true
  }

  /** De los SMS de la bandeja, devuelve los que el receiver nunca vio y los marca como recuperados. */
  fun claimMissed(context: Context, inbox: List<InboxSms>): List<InboxSms> = synchronized(lock) {
    val (p, seen) = loadSeen(context)
    val counts = HashMap<String, Int>()
    seen.forEach { counts.merge(it.optString("h"), 1, Int::plus) }

    val missed = mutableListOf<InboxSms>()
    for (sms in inbox) {
      val fingerprint = SmsFilter.fingerprint(sms.body)
      val count = counts[fingerprint] ?: 0
      if (count > 0) {
        counts[fingerprint] = count - 1
      } else {
        missed += sms
        seen += seenJson(fingerprint, recovered = true)
      }
    }
    if (missed.isNotEmpty()) saveSeen(p, seen)
    missed
  }

  private fun seenJson(fingerprint: String, recovered: Boolean) = JSONObject()
    .put("h", fingerprint)
    .put("t", System.currentTimeMillis())
    .put("r", recovered)
    .put("c", false)

  // ---- JSON ----

  private fun HistoryEntry.toJson() = JSONObject()
    .put("id", id)
    .put("receivedAt", receivedAt)
    .put("sender", sender)
    .put("text", text)
    .put("status", status)
    .put("attempts", attempts)
    .put("error", error ?: JSONObject.NULL)
    .put("sentAt", sentAt ?: JSONObject.NULL)
    .put("recovered", recovered)

  private fun entryFromJson(o: JSONObject) = HistoryEntry(
    id = o.optString("id"),
    receivedAt = o.optLong("receivedAt"),
    sender = o.optString("sender"),
    text = o.optString("text"),
    status = o.optString("status", PENDING),
    attempts = o.optInt("attempts"),
    error = if (o.isNull("error")) null else o.optString("error"),
    sentAt = if (o.isNull("sentAt")) null else o.optLong("sentAt"),
    recovered = o.optBoolean("recovered")
  )

  private fun HistoryEntry.toMap(): Map<String, Any?> = mapOf(
    "id" to id,
    "receivedAt" to receivedAt.toDouble(),
    "sender" to sender,
    "text" to text,
    "status" to status,
    "attempts" to attempts,
    "error" to error,
    "sentAt" to sentAt?.toDouble(),
    "recovered" to recovered
  )
}
