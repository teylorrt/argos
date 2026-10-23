package dev.teylor.argos

import android.app.Application
import dev.teylor.argos.sync.SyncScheduler

class ArgosApplication : Application() {
    override fun onCreate() { super.onCreate(); SyncScheduler.periodic(this) }
}
