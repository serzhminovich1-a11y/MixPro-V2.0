import { useEffect, useRef, useState } from "react";
import { TrackPlayer, type PlayerTrack, type TrackPlayerHandle, type TrackPin } from "@/components/track-player";
import { TrackCommentsPanel } from "@/components/track-comments";
import { supabase } from "@/integrations/supabase/client";
import { resolveStorageUrl } from "@/lib/storage-url";

type Props = {
  postId: string;
  tracks: PlayerTrack[];
  cover?: string | null;
  title?: string;
  artist?: string;
  currentUserId: string | null;
  currentUserAvatar?: string | null;
  currentUserName?: string | null;
  createdAt?: string | null;
  genre?: string | null;
  playCount?: number;
  commentCount?: number;
  likeCount?: number;
  likedByMe?: boolean;
  canDeleteAny: boolean;
  initialTrackIndex?: number;
  initialSeekMs?: number;
  onLike?: () => void;
};

export function TrackCard(props: Props) {
  const {
    postId, tracks, cover, title, artist, currentUserId, currentUserAvatar, currentUserName,
    createdAt, genre, playCount, commentCount, likeCount, likedByMe, canDeleteAny,
    initialTrackIndex, initialSeekMs, onLike,
  } = props;
  const playerRef = useRef<TrackPlayerHandle>(null);
  const [activeIdx, setActiveIdx] = useState(initialTrackIndex ?? 0);
  const [currentMs, setCurrentMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [pins, setPins] = useState<TrackPin[]>([]);
  const [liveCommentCount, setLiveCommentCount] = useState(commentCount ?? 0);

  useEffect(() => setLiveCommentCount(commentCount ?? 0), [commentCount]);

  const loadPins = async () => {
    const { data } = await supabase
      .from("track_comments")
      .select("timestamp_ms, content, author_id")
      .eq("post_id", postId)
      .eq("track_index", activeIdx)
      .is("parent_id", null)
      .not("timestamp_ms", "is", null);
    const rows = (data ?? []) as Array<{ timestamp_ms: number; content: string; author_id: string }>;
    const authorIds = Array.from(new Set(rows.map((r) => r.author_id)));
    const authorMap = new Map<string, { username: string; avatar: string | null }>();
    if (authorIds.length) {
      const { data: authors } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", authorIds);
      for (const a of authors ?? []) {
        const signed = await resolveStorageUrl("avatars", a.avatar_url, "avatars");
        authorMap.set(a.id, { username: a.username, avatar: signed });
      }
    }
    setPins(rows.map((c) => {
      const info = authorMap.get(c.author_id);
      return { ms: c.timestamp_ms, content: c.content, title: c.content, username: info?.username, avatar: info?.avatar };
    }));
  };

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await loadPins(); })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId, activeIdx, currentUserId]);

  const reloadPins = () => loadPins();

  const [addFocus, setAddFocus] = useState(0);

  return (
    <div>
      <TrackPlayer
        ref={playerRef}
        postId={postId}
        tracks={tracks}
        cover={cover}
        title={title}
        artist={artist}
        currentUserId={currentUserId}
        currentUserAvatar={currentUserAvatar}
        currentUserName={currentUserName}
        createdAt={createdAt}
        genre={genre}
        playCount={playCount}
        commentCount={liveCommentCount}
        likeCount={likeCount}
        likedByMe={likedByMe}
        pins={pins}
        initialTrackIndex={initialTrackIndex}
        initialSeekMs={initialSeekMs}
        onLike={onLike}
        onActiveChange={(i) => setActiveIdx(i)}
        onTimeChange={(ms, dur) => { setCurrentMs(ms); setDurationMs(dur); }}
        onAddCommentAtCurrent={() => setAddFocus((n) => n + 1)}
      />
      <TrackCommentsPanel
        postId={postId}
        trackIndex={activeIdx}
        durationMs={durationMs}
        currentMs={currentMs}
        onSeek={(ms) => playerRef.current?.seekMs(ms)}
        currentUserId={currentUserId}
        canDeleteAny={canDeleteAny}
        onCountChange={(n) => { setLiveCommentCount(n); reloadPins(); }}
        key={`comments-${activeIdx}-${addFocus}`}
      />
    </div>
  );
}
