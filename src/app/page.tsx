"use client";
import { useState } from "react";
import TimelineStudioModal from "@/components/studio/TimelineStudioModal";

export default function Page() {
  const [open, setOpen] = useState(false);
  return (
    <main style={{ padding: 24 }}>
      <button onClick={()=>setOpen(true)}>Open Timeline</button>
      <TimelineStudioModal
        isOpen={open}
        onClose={()=>setOpen(false)}
        videoSrc="/sample.mp4"
        initialChaptersUrl="/chapters.json"
        durationSec={36000}
      />
    </main>
  );
}
