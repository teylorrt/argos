package dev.teylor.argos.data;

import androidx.room.*;
import java.util.List;

@Dao
public interface QueueDao {
    @Insert void insert(QueueItem item);
    @Insert(onConflict = OnConflictStrategy.IGNORE) void seen(SeenItem item);
    @Query("SELECT COUNT(*) FROM seen WHERE fingerprint=:key") int isSeen(String key);
    @Query("DELETE FROM seen WHERE createdAt<:before") void pruneSeen(long before);
    @Query("SELECT COUNT(*) FROM seen") int seenCount();
    @Query("SELECT * FROM queue WHERE state='pending' ORDER BY createdAt LIMIT 100") List<QueueItem> pending();
    @Query("SELECT COALESCE(SUM(LENGTH(envelope)),0) FROM queue") long bytes();
    @Query("SELECT COUNT(*) FROM queue") int count();
    @Query("SELECT COUNT(*) FROM queue WHERE state='rejected'") int rejected();
    @Query("SELECT MIN(createdAt) FROM queue") Long oldest();
    @Query("DELETE FROM queue WHERE eventId=:id") void accepted(String id);
    @Query("UPDATE queue SET attempts=attempts+1,error=:code WHERE eventId=:id") void retry(String id, String code);
    @Query("UPDATE queue SET state='rejected',error=:code,attempts=attempts+1 WHERE eventId=:id") void reject(String id, String code);
    @Query("DELETE FROM queue") void clear();
    @Query("SELECT * FROM queue WHERE error IS NOT NULL ORDER BY createdAt LIMIT 20") List<QueueItem> errors();
}
