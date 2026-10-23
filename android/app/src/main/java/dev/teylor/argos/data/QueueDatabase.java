package dev.teylor.argos.data;

import androidx.room.Database;
import androidx.room.RoomDatabase;

@Database(entities = {QueueItem.class, SeenItem.class}, version = 1, exportSchema = false)
public abstract class QueueDatabase extends RoomDatabase {
    public abstract QueueDao queue();
}
