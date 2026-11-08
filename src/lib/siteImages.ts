// siteImages.ts
// The owner's pictures for the booking page (a service, a "Your hair" option): shrunk in the
// browser, then uploaded to Firebase Storage under site-images/ (storage.rules: public read,
// owner-only write, JPEG/PNG/WebP under 2 MB). The pure helpers are unit-tested; the canvas
// and upload parts need a browser.

import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

export const MAX_SIDE = 800; // longest side after shrinking, in pixels
export const MAX_BYTES = 2 * 1024 * 1024; // must match storage.rules
export const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;

/** Size to draw an image at so its longest side is at most `max`, never enlarging it. */
export const fitWithin = (w: number, h: number, max = MAX_SIDE): { width: number; height: number } => {
  if (w <= 0 || h <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
};

/** Why a chosen file can't be used, or null when it can. */
export const imageFileProblem = (file: { type: string; size: number }): string | null => {
  if (!(ACCEPTED as readonly string[]).includes(file.type)) return "Please choose a JPEG, PNG or WebP picture.";
  if (file.size > 20 * 1024 * 1024) return "That picture is too large. Please choose one under 20 MB.";
  return null;
};

/** A storage object name that is safe and cannot clash: "<kind>-<time>-<random>.webp". */
export const siteImageName = (kind: string, now = Date.now(), rand = Math.random()): string =>
  `${kind.replace(/[^a-z0-9-]/gi, "").slice(0, 20) || "img"}-${now.toString(36)}-${Math.floor(rand * 1e9).toString(36)}.webp`;

const shrink = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = fitWithin(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("This browser cannot resize pictures."));
      ctx.drawImage(img, 0, 0, width, height); // redrawing also drops any location data in the file
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not prepare that picture."))), "image/webp", 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file could not be read as a picture."));
    };
    img.src = url;
  });

/** Shrinks and uploads a picture; resolves to its public address. */
export const uploadSiteImage = async (file: File, kind: string): Promise<string> => {
  const problem = imageFileProblem(file);
  if (problem) throw new Error(problem);
  const blob = await shrink(file);
  if (blob.size >= MAX_BYTES) throw new Error("That picture is still too large after shrinking. Please choose a smaller one.");
  const r = ref(storage, `site-images/${siteImageName(kind)}`);
  await uploadBytes(r, blob, { contentType: "image/webp" });
  return getDownloadURL(r);
};

/** Removes an uploaded picture by its address; a missing one is fine. */
export const deleteSiteImage = async (url: string): Promise<void> => {
  try {
    await deleteObject(ref(storage, url));
  } catch {
    /* already gone, or not one of ours: nothing to clean up */
  }
};
