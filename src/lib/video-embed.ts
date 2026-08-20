// Videos are external YouTube links, not uploaded files (no video hosting/
// transcoding infra exists in this project). This extracts a video id from
// any common YouTube URL shape so a link can render as a real embed +
// thumbnail instead of a bare "click to visit YouTube" link.

const PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
];

export function youtubeId(url: string): string | null {
  for (const re of PATTERNS) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

export function isValidVideoUrl(url: string): boolean {
  return !!youtubeId(url);
}

export function youtubeThumbnail(id: string): string {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube.com/embed/${id}`;
}
