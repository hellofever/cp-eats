"use client";

import { useRef, useState } from "react";

type FadeImageProps = {
  src: string;
  alt?: string;
  className?: string;
  showSkeleton?: boolean;
  onError?: () => void;
};

// Shared <img> wrapper for every photo on the site: crossfades in once the
// image has actually decoded, instead of a jarring pop-in (or a broken-image
// flash) once the network request resolves. Optionally shows a pulsing
// skeleton while waiting.
//
// Keyed on `src` so a new/refreshed URL always starts from clean load/error state via
// remount, rather than reaching into a ref during render to detect the change (React's
// docs recommend the key approach for exactly this over manual prop-change detection).
export function FadeImage(props: FadeImageProps) {
  return <FadeImageForSrc key={props.src} {...props} />;
}

// `onError` is a self-heal hook, not just error reporting: our photo URLs are Supabase
// signed URLs cached client-side (see lib/photos.ts), so a load failure usually means
// the cached URL outlived its token rather than the photo being gone. Callers pass a
// handler that force-refetches a fresh signed URL -- remounting via the `key` above
// hands this component a new `src` and a fresh one-retry budget once that resolves.
function FadeImageForSrc({ src, alt = "", className = "", showSkeleton = true, onError }: FadeImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const retried = useRef(false);

  function handleError() {
    if (retried.current) {
      setFailed(true);
      return;
    }
    retried.current = true;
    onError?.();
  }

  if (failed) return null;

  return (
    <div className={`relative overflow-hidden bg-black/5 dark:bg-white/10 ${className}`}>
      {!loaded && showSkeleton && (
        <div className="absolute inset-0 animate-pulse bg-black/5 dark:bg-white/10" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={handleError}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          loaded ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}
