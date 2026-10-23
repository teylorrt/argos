package dev.teylor.argos.data;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

@Entity(tableName = "queue")
public class QueueItem {
    @PrimaryKey @NonNull public String eventId = "";
    @NonNull public String envelope = "";
    @NonNull public String state = "pending";
    public int attempts = 0;
    public long createdAt = 0;
    public String error = null;
}
