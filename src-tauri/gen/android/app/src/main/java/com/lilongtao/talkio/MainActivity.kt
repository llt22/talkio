package com.lilongtao.talkio

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

class MainActivity : TauriActivity() {
  private val shareHelper by lazy { ShareHelper(this) }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleIncomingIntent(intent)

    // Handle Android back button via stackflow JS bridge
    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val webView = findWebView(window.decorView)
        if (webView != null) {
          webView.evaluateJavascript(
            "(function(){ if(window.__stackflowBack) return window.__stackflowBack(); return false; })()"
          ) { result ->
            if (result == "false" || result == "null") {
              // stackflow is at root, allow default behavior (exit app)
              isEnabled = false
              onBackPressedDispatcher.onBackPressed()
            }
          }
        } else {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
        }
      }
    })
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleIncomingIntent(intent)
  }

  private fun handleIncomingIntent(intent: Intent?) {
    if (intent == null) return
    if (intent.action != Intent.ACTION_VIEW) return
    val uri = intent.data ?: return

    try {
      val inputStream = contentResolver.openInputStream(uri) ?: return
      val reader = BufferedReader(InputStreamReader(inputStream))
      val content = reader.readText()
      reader.close()
      inputStream.close()

      val pendingFile = File(filesDir, "pending_import.json")
      pendingFile.writeText(content)
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    webView.addJavascriptInterface(shareHelper, "NativeShare")
  }

  private fun findWebView(view: View): WebView? {
    if (view is WebView) return view
    if (view is ViewGroup) {
      for (i in 0 until view.childCount) {
        val found = findWebView(view.getChildAt(i))
        if (found != null) return found
      }
    }
    return null
  }
}
