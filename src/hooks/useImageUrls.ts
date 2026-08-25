import { useEffect, useState } from "react";
import { isInlineImage, resolveImageUrl } from "../services/image-store";

/**
 * Resolve stored generated-image references into displayable URLs.
 *
 * Inline `data:` images are returned as-is on the first render; file references
 * are read from disk into blob URLs, which are revoked when the component
 * unmounts or the reference list changes. A reference that fails to resolve is
 * dropped rather than rendered as a broken image.
 */
export function useImageUrls(refs: string[] | null | undefined): string[] {
  const key = refs?.join(" ") ?? "";
  const [urls, setUrls] = useState<string[]>(() => (refs ?? []).filter(isInlineImage));

  useEffect(() => {
    const list = key ? key.split(" ") : [];
    if (list.every(isInlineImage)) {
      setUrls(list);
      return;
    }
    let cancelled = false;
    const created: string[] = [];
    Promise.all(
      list.map((ref) =>
        resolveImageUrl(ref).then(
          (url) => {
            if (!isInlineImage(ref)) created.push(url);
            return url;
          },
          (err) => {
            console.warn("[useImageUrls] cannot load generated image:", ref, err);
            return null;
          },
        ),
      ),
    ).then((resolved) => {
      if (cancelled) {
        for (const url of created) URL.revokeObjectURL(url);
        return;
      }
      setUrls(resolved.filter((url): url is string => url !== null));
    });
    return () => {
      cancelled = true;
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [key]);

  return urls;
}
