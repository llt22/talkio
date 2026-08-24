package com.lilongtao.talkio

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader

class MainActivity : TauriActivity() {
  private val shareHelper by lazy { ShareHelper(this) }
  private val secretStoreBridge by lazy { SecretStoreBridge(this) }
  private var lastKeyboardInsetCss = -1

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
              // stackflow is at root, minimize to background instead of exiting
              moveTaskToBack(true)
            }
          }
        } else {
          moveTaskToBack(true)
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
    webView.addJavascriptInterface(secretStoreBridge, "TalkioSecretStore")
    installKeyboardInsetBridge(webView)
  }

  /**
   * Report the soft keyboard height (including the IME candidate bar) to the WebView.
   *
   * Android 15 (API 35) enforces edge-to-edge and ignores windowSoftInputMode, so the
   * window is no longer resized when the IME opens and `visualViewport` never shrinks —
   * the web layer has no way to know the keyboard is there and the composer stays hidden
   * behind it. Below API 35 the system still resizes the window, so the CSS layout adapts
   * on its own and reporting an inset here would push the composer up twice.
   */
  private fun installKeyboardInsetBridge(webView: WebView) {
    if (Build.VERSION.SDK_INT < 35) return
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      val density = view.resources.displayMetrics.density
      val cssPx = if (density > 0f) Math.round(imeBottom / density) else imeBottom
      if (cssPx != lastKeyboardInsetCss) {
        lastKeyboardInsetCss = cssPx
        webView.evaluateJavascript(
          "window.__talkioSetKeyboardInset && window.__talkioSetKeyboardInset($cssPx)",
          null
        )
      }
      insets
    }
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
