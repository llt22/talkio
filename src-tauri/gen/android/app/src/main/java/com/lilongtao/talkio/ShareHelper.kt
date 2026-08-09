package com.lilongtao.talkio

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Base64
import android.webkit.JavascriptInterface
import androidx.core.content.FileProvider
import org.json.JSONArray
import java.io.File

class ShareHelper(private val context: Context) {

    @JavascriptInterface
    fun shareFile(filename: String, content: String, mimeType: String) {
        try {
            val cacheDir = File(context.cacheDir, "share")
            cacheDir.mkdirs()
            val file = File(cacheDir, File(filename).name)
            file.writeText(content)
            shareExistingFile(file, mimeType)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @JavascriptInterface
    fun shareBase64File(filename: String, content: String, mimeType: String) {
        try {
            val cacheDir = File(context.cacheDir, "share")
            cacheDir.mkdirs()
            val file = File(cacheDir, File(filename).name)
            file.writeBytes(Base64.decode(content, Base64.DEFAULT))
            shareExistingFile(file, mimeType)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @JavascriptInterface
    fun shareBase64Files(filesJson: String, mimeType: String) {
        try {
            val cacheDir = File(context.cacheDir, "share")
            cacheDir.mkdirs()
            val files = JSONArray(filesJson)
            val uris = ArrayList<Uri>()
            for (index in 0 until files.length()) {
                val item = files.getJSONObject(index)
                val file = File(cacheDir, File(item.getString("filename")).name)
                file.writeBytes(Base64.decode(item.getString("content"), Base64.DEFAULT))
                uris.add(
                    FileProvider.getUriForFile(
                        context,
                        "${context.packageName}.fileprovider",
                        file
                    )
                )
            }
            val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
                type = mimeType
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(intent, null)
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(chooser)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun shareExistingFile(file: File, mimeType: String) {
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file
        )
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mimeType
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        val chooser = Intent.createChooser(intent, null)
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(chooser)
    }
}
