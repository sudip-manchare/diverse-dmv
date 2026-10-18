"use client";
import type { ProfileData } from "@/shared/contracts";
export const profileDrafts = new Map<string, ProfileData>();
let currentActor: string | null = null;
export function bindDraftActor(actorId: string) {
  if (currentActor && currentActor !== actorId) {
    profileDrafts.clear();
    window.dispatchEvent(new Event("clear-private-drafts"));
  }
  currentActor = actorId;
}
if (typeof window !== "undefined")
  window.addEventListener("clear-private-drafts", () => {
    profileDrafts.clear();
    currentActor = null;
  });
