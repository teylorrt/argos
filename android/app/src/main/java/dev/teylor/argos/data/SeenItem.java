package dev.teylor.argos.data;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

@Entity(tableName = "seen")
public class SeenItem {
    @PrimaryKey @NonNull public String fingerprint = "";
    public long createdAt = 0;
}
