"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as css from "./timeline.css";
import { button } from "@/styles/studioTheme.css";
import { log } from "console";

type Speaker = {
  id: string;
  vod_chapter_id: string;
  speaker_name: string;
  speaker_title: string;
  speaker_avatar_url: string;
  in_time: string;
  out_time: string;
  order: number;
  speaker_id: string;
  speaker_category_id: string
};
type ChapterData = {
  id: string;
  title: string;
  description: string;
  in_time: string;
  out_time: string;
  order: number;
  source: string
};
type Media = {
  id: string;
  title: string;
  type: string;
  vod_chapters: ChapterData[];
  vod_chapter_speakers: Speaker[]
};
type SpeakerCatalogItem = {
  id: string;
  name: string;
  title: string;
  avatar_url: string;
  category_id: string;
};
type Chapter = ChapterData & {
  speakers: Speaker[]
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  videoSrc: string;             // /sample.mp4
  initialChaptersUrl?: string;  // /chapters.json (optional)
  durationSec?: number;         // fallback if json empty
  onEditChapter?: (chapterId: string) => void; // open external chapter editor
  onOpenAdvancedChapterModal?: () => void;     // open existing advanced modal
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export default function TimelineStudioModal({
  isOpen,
  onClose,
  videoSrc,
  initialChaptersUrl = "/chapters.json",
  durationSec = 36000, // 10h
  onEditChapter,
  onOpenAdvancedChapterModal,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [scale, setScale] = useState(5); // px/sec (zoom)
  const [currentTime, setCurrentTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speakerCatalog, setSpeakerCatalog] = useState<SpeakerCatalogItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("executives");
  const [showSpeakers, setShowSpeakers] = useState<boolean>(true);

  // dragging / resizing state
  const [dragId, setDragId] = useState<{ type: "chapter" | "speaker"; chapterId: string; id: string } | null>(null);
  const [resize, setResize] = useState<{ edge: "L" | "R"; type: "chapter" | "speaker"; chapterId: string; id: string } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const [selected, setSelected] = useState<{ type: "chapter" | "speaker"; id: string } | null>(null);
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
  // Built-in fallback editor state
  const [editorChapterId, setEditorChapterId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Context menu state
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; t: number; track: "chapter" | "speaker"; chapterId?: string }
    | null
  >(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const toPixels = (t: number) => t * scale;
  const toSeconds = (px: number) => px / scale;

  const SNAP_THRESHOLD_SEC = 0.25; // seconds

  const openChapterEditor = (chapterId: string) => {
    if (onEditChapter) {
      try { onEditChapter(chapterId); } catch {}
      return;
    }
    // Fallback: open built-in lightweight editor
    setEditorChapterId(chapterId);
    const ch = chapters.find(c => c.id === chapterId);
    if (ch) {
      setEditTitle(ch.title || "");
      setEditDescription(ch.description || "");
    }
    // Also emit event for external listeners
    try { window.dispatchEvent(new CustomEvent("open-chapter-editor", { detail: { chapterId } })); } catch {}
  };

  const closeInlineEditor = () => {
    setEditorChapterId(null);
    setEditTitle("");
    setEditDescription("");
  };

  const saveInlineEditor = () => {
    if (!editorChapterId) return;
    setChapters(prev => prev.map(c => c.id === editorChapterId ? { ...c, title: editTitle, description: editDescription } : c));
    closeInlineEditor();
  };

  const exportTimelineData = () => {
    const timelineData = {
      chapters: chapters.map(ch => ({
        id: ch.id,
        title: ch.title,
        startTime: parseTime(ch.in_time),
        endTime: parseTime(ch.out_time),
        speakers: ch.speakers.map(s => ({
          id: s.speaker_id,
          name: s.speaker_name,
          startTime: parseTime(s.in_time),
          endTime: parseTime(s.out_time)
        }))
      }))
    };
    
    // Copy to clipboard
    navigator.clipboard.writeText(JSON.stringify(timelineData, null, 2)).then(() => {
      alert("Timeline data copied to clipboard!");
    }).catch(() => {
      // Fallback: show in console
      console.log("Timeline Data:", timelineData);
      alert("Timeline data logged to console (check developer tools)");
    });
  };

  const parseTime = (timeStr: string) => {
    if (!timeStr) return 0;
    const parts = timeStr.split(":").map(Number);
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
    }
    if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return (minutes || 0) * 60 + (seconds || 0);
    }
    if (parts.length === 1) {
      return parts[0] || 0;
    }
    return 0;
  }

  const extendChapterBySpeakers = (media: Media) => {
    const chapters = media.vod_chapters as Chapter[];
    let speakers = [] as Speaker[];

    chapters.forEach(ch => {
      media.vod_chapter_speakers.forEach(sp => {
        if (ch.id === sp.vod_chapter_id) speakers.push(sp);
      })
      ch.speakers = speakers;
      speakers = []
    })

    return chapters;
  }

  // Normalize overlaps (non-destructive to backend; we adjust in-memory for UX)
  const normalizeTimelines = (chs: Chapter[]) => {
    let hadOverlap = false;
    // Chapters
    const sortedCh = [...chs].sort((a,b)=>parseTime(a.in_time)-parseTime(b.in_time)).map(c=>({ ...c, speakers:[...c.speakers] }));
    for (let i=1;i<sortedCh.length;i++){
      const prev = sortedCh[i-1];
      const cur = sortedCh[i];
      const prevEnd = parseTime(prev.out_time);
      const curStart = parseTime(cur.in_time);
      if (curStart < prevEnd) {
        hadOverlap = true;
        const shift = prevEnd - curStart;
        const curEnd = parseTime(cur.out_time) + shift;
        cur.in_time = formatTime(prevEnd);
        cur.out_time = formatTime(curEnd);
        // shift speakers
        cur.speakers = cur.speakers.map(s=>({
          ...s,
          in_time: formatTime(parseTime(s.in_time)+shift),
          out_time: formatTime(parseTime(s.out_time)+shift)
        }));
      }
    }
    // Speakers per chapter
    for (const ch of sortedCh){
      const chStart = parseTime(ch.in_time);
      const chEnd = parseTime(ch.out_time);
      ch.speakers.sort((a,b)=>parseTime(a.in_time)-parseTime(b.in_time));
      for (let i=1;i<ch.speakers.length;i++){
        const prev = ch.speakers[i-1];
        const cur = ch.speakers[i];
        const prevEnd = parseTime(prev.out_time);
        const curStart = parseTime(cur.in_time);
        if (curStart < prevEnd) {
          hadOverlap = true;
          const width = Math.max(0.5, parseTime(cur.out_time) - parseTime(cur.in_time));
          const ns = Math.min(prevEnd, chEnd - width);
          cur.in_time = formatTime(ns);
          cur.out_time = formatTime(ns + width);
        }
        // clamp to chapter
        const sStart = parseTime(cur.in_time);
        const sEnd = parseTime(cur.out_time);
        if (sStart < chStart || sEnd > chEnd) {
          hadOverlap = true;
          const width = Math.max(0.5, sEnd - sStart);
          const ns = clamp(sStart, chStart, chEnd - width);
          cur.in_time = formatTime(ns);
          cur.out_time = formatTime(ns + width);
        }
      }
    }
    if (hadOverlap) setOverlapWarning("Overlapping timecodes detected from backend. Adjusted layout locally."); else setOverlapWarning(null);
    return sortedCh;
  };

  // Load nested data
  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const res = await fetch(initialChaptersUrl);

        if (res.ok) {
          const data = await res.json() as Media;
          
          setChapters(normalizeTimelines(extendChapterBySpeakers(data)));
        } else {
          setChapters([]);
        }
      } catch {
        setChapters([]);
      }
    })();
    // Also load speakers catalog
    (async () => {
      try {
        const res = await fetch("/speakers.json");
        if (res.ok) {
          const data = await res.json() as SpeakerCatalogItem[];
          setSpeakerCatalog(data);
        } else {
          setSpeakerCatalog([]);
        }
      } catch {
        setSpeakerCatalog([]);
      }
    })();
  }, [isOpen, initialChaptersUrl]);

  // Video sync handled via video element props (onTimeUpdate/onPlay/onPause)

  // Smooth playhead updates while playing (raf-based)
  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    const tick = () => {
      const v = videoRef.current;
      if (v) setCurrentTime(v.currentTime);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playing]);

  // Dismiss context menu on scroll or outside click
  useEffect(() => {
    const sc = scrollRef.current;
    const onScroll = () => setContextMenu(null);
    sc?.addEventListener("scroll", onScroll);
    const onDocMouseDown = (ev: MouseEvent) => {
      if (!menuRef.current) { setContextMenu(null); return; }
      if (!menuRef.current.contains(ev.target as Node)) setContextMenu(null);
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      sc?.removeEventListener("scroll", onScroll);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, []);

  // Derived: total duration from chapters, else fallback
  const totalDuration = useMemo(() => {
    const maxOut = chapters.reduce((acc, c) => Math.max(acc, parseTime(c.out_time)), 0);
    return Math.max(maxOut, durationSec);
  }, [chapters, durationSec]);

  const px = (sec: number) => sec * scale;
  const sec = (pxv: number) => pxv / scale;

  // Autoscale ruler ticks (nice step)
  const tickStep = useMemo(() => {
    // choose from [1s, 2s, 5s, 10s, 30s, 60s, 120s, 300s]
    const candidates = [1,2,5,10,30,60,120,300,600,1800,3600];
    const minPx = 80;
    for (const s of candidates) if (px(s) >= minPx) return s;
    return 3600;
  }, [scale]);

  const categories = useMemo(() => {
    const ids = Array.from(new Set(speakerCatalog.map(s => s.category_id)));
    return ids;
  }, [speakerCatalog]);

  const onCategoryChange = (nextCategory: string) => {
    if (nextCategory === selectedCategory) return;
    const proceed = window.confirm(
      "Changing category will remove all speakers from the timeline. Continue?"
    );
    if (!proceed) return;
    setSelectedCategory(nextCategory);
    setChapters(prev => prev.map(c => ({ ...c, speakers: [] })));
  };

  // Virtualization: only render visible time range
  const visibleRange = useMemo(() => {
    const sc = scrollRef.current;
    if (!sc) return { start: 0, end: Math.min(120, totalDuration) };
    const start = sec(sc.scrollLeft);
    const end = sec(sc.scrollLeft + sc.clientWidth);
    // add small buffer
    return { start: Math.max(0, start - 10), end: Math.min(totalDuration, end + 10) };
  }, [scrollRef.current?.scrollLeft, scrollRef.current?.clientWidth, scale, totalDuration]); // eslint-disable-line

  const visibleChapters = useMemo(
    () => chapters.filter(c => parseTime(c.out_time) >= visibleRange.start && parseTime(c.in_time) <= visibleRange.end),
    [chapters, visibleRange]
  );

  // Auto-follow playhead when playing
  useEffect(() => {
    if (!playing) return;
    const sc = scrollRef.current;
    if (!sc) return;
    const x = px(currentTime);
    const left = sc.scrollLeft;
    const right = left + sc.clientWidth;
    const margin = 120; // keep some leading space
    if (x > right - margin) sc.scrollLeft = x - sc.clientWidth + margin;
    if (x < left + margin) sc.scrollLeft = Math.max(0, x - margin);
  }, [currentTime, scale, playing]);

  // Click ruler to seek
  const onRulerClick = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    const t = clamp(sec(x), 0, totalDuration);
    if (videoRef.current) videoRef.current.currentTime = t;
    setCurrentTime(t);
  };

  // Right-click on tracks
  const onTrackContextMenu = (
    e: React.MouseEvent,
    track: "chapter" | "speaker",
    chapterId?: string
  ) => {
    e.preventDefault();
    const sc = scrollRef.current;
    if (!sc) return;
    const contentRect = sc.getBoundingClientRect();
    const xInsideContent = e.clientX - contentRect.left + sc.scrollLeft;
    const t = clamp(sec(xInsideContent), 0, totalDuration);
    setContextMenu({ x: e.clientX, y: e.clientY, t, track, chapterId });
  };

  // CRUD
  const addChapterAt = (_t: number) => {
    const id = crypto.randomUUID();
    const lastOut = chapters.length
      ? Math.max(...chapters.map(c => parseTime(c.out_time)))
      : 0;
    const start = lastOut;
    const duration = 60; // default 60s
    const end = start + duration;
    const newCh: Chapter = {
      id,
      title: "New chapter",
      description: "",
      in_time: formatTime(start),
      out_time: formatTime(end),
      order: 0,
      source: 'source',
      speakers: []
    };
    setChapters(prev => [...prev, newCh].sort((a,b)=>parseTime(a.in_time)-parseTime(b.in_time)));
    // Open editor for the new chapter (uses external handler if provided, otherwise inline editor)
    openChapterEditor(id);
  };
  const addSpeakerToChapter = (chapterId: string, _t: number, category: string = "executives") => {
    setChapters(prev => {
      const idx = prev.findIndex(p => p.id === chapterId);
      if (idx === -1) return prev;
      const target = prev[idx];
      const chapterStart = parseTime(target.in_time);
      const chapterEnd = parseTime(target.out_time);
      const existingIds = new Set(target.speakers.map(s => s.speaker_id));
      const candidates = speakerCatalog.filter(s => s.category_id === category && !existingIds.has(s.id));
      if (!candidates.length) return prev;

      const durationPerSpeaker = 30; // seconds
      let cursor = target.speakers.length
        ? Math.max(...target.speakers.map(s => parseTime(s.out_time)))
        : chapterStart;
      cursor = clamp(cursor, chapterStart, Math.max(chapterStart, chapterEnd - 0.5));

      // Build all new speakers sequentially (not limited by current chapter end)
      const newSpeakers: Speaker[] = [];
      let orderBase = target.speakers.length;
      let requiredEnd = cursor;
      for (const pick of candidates) {
        const segStart = requiredEnd;
        const segEnd = segStart + durationPerSpeaker;
        newSpeakers.push({
          id: crypto.randomUUID(),
          vod_chapter_id: chapterId,
          speaker_name: pick.name,
          speaker_title: pick.title,
          speaker_avatar_url: pick.avatar_url,
          in_time: formatTime(segStart),
          out_time: formatTime(segEnd),
          order: orderBase++,
          speaker_id: pick.id,
          speaker_category_id: pick.category_id
        });
        requiredEnd = segEnd;
      }

      // Determine how much we need to extend and whether we must shift following chapters
      const currentEnd = chapterEnd;
      const neededExtension = Math.max(0, requiredEnd - currentEnd);
      if (neededExtension === 0) {
        // Fits inside current chapter; just append
        const updated = prev.map(ch => ch.id === chapterId ? { ...ch, speakers: [...ch.speakers, ...newSpeakers] } : ch);
        return updated;
      }

      // Find next chapter start after target
      const afterChapters = prev.filter(ch => parseTime(ch.in_time) >= currentEnd && ch.id !== chapterId);
      const nextStart = afterChapters.length
        ? Math.min(...afterChapters.map(ch => parseTime(ch.in_time)))
        : totalDuration;

      // We will extend target by neededExtension and shift any chapters that start at or after nextStart by neededExtension
      const shifted = prev.map(ch => {
        if (ch.id === chapterId) {
          return {
            ...ch,
            out_time: formatTime(currentEnd + neededExtension),
            speakers: [...ch.speakers, ...newSpeakers]
          };
        }
        const chStart = parseTime(ch.in_time);
        const chEnd = parseTime(ch.out_time);
        if (chStart >= nextStart) {
          const ns = chStart + neededExtension;
          const ne = chEnd + neededExtension;
          return {
            ...ch,
            in_time: formatTime(ns),
            out_time: formatTime(ne),
            speakers: ch.speakers.map(s => ({
              ...s,
              in_time: formatTime(parseTime(s.in_time) + neededExtension),
              out_time: formatTime(parseTime(s.out_time) + neededExtension)
            }))
          };
        }
        return ch;
      });

      return shifted;
    });
  };
  const deleteChapter = (chapterId: string) => {
    setChapters(prev => prev.filter(c => c.id !== chapterId));
  };

  // Drag / Resize helpers
  const beginDrag = (e: React.MouseEvent, type: "chapter"|"speaker", chapterId: string, id: string, startSec: number) => {
    setDragId({ type, chapterId, id });
    setDragOffset(e.clientX - px(startSec));
  };
  const beginResize = (e: React.MouseEvent, edge: "L"|"R", type: "chapter"|"speaker", chapterId: string, id: string) => {
    e.stopPropagation();
    setResize({ edge, type, chapterId, id });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragId && !resize) return;

    setChapters(prev => prev.map(ch => {
      if (dragId && dragId.type === "chapter" && ch.id === dragId.id) {
        // move chapter + shift children, preventing overlap with other chapters
        const width = parseTime(ch.out_time) - parseTime(ch.in_time);
        let ns = sec(e.clientX - dragOffset);
        // neighbor-aware bounds
        const others = prev.filter(o => o.id !== ch.id).sort((a,b)=>parseTime(a.in_time)-parseTime(b.in_time));
        let prevEndBound = 0;
        let nextStartBound = totalDuration;
        for (let i = 0; i < others.length; i++) {
          const o = others[i];
          const oStart = parseTime(o.in_time);
          const oEnd = parseTime(o.out_time);
          if (oEnd <= parseTime(ch.in_time) && oEnd > prevEndBound) prevEndBound = oEnd;
          if (oStart >= parseTime(ch.out_time) && oStart < nextStartBound) nextStartBound = oStart;
        }
        const minStart = prevEndBound;
        const maxStart = Math.max(minStart, nextStartBound - width);
        // Snap to neighbor edges
        if (Math.abs(ns - minStart) <= SNAP_THRESHOLD_SEC) ns = minStart;
        if (Math.abs(ns - maxStart) <= SNAP_THRESHOLD_SEC) ns = maxStart;
        ns = clamp(ns, minStart, maxStart);
        const delta = ns - parseTime(ch.in_time);
        const ne = ns + width;
        return {
          ...ch,
          in_time: formatTime(ns),
          out_time: formatTime(ne),
          speakers: ch.speakers.map(s => {
            const sStart = clamp(parseTime(s.in_time) + delta, ns, ne);
            const sEnd = clamp(parseTime(s.out_time) + delta, sStart + 0.1, ne);
            return { ...s, in_time: formatTime(sStart), out_time: formatTime(sEnd) };
          })
        };
      }
      if (dragId && dragId.type === "speaker" && ch.id === dragId.chapterId) {
        return {
          ...ch,
          speakers: ch.speakers.map(s => {
            if (s.id !== dragId.id) return s;
            const width = parseTime(s.out_time) - parseTime(s.in_time);
            let ns = sec(e.clientX - dragOffset);
            // Prevent overlap with neighbors within the same chapter
            const others = ch.speakers.filter(os => os.id !== s.id)
              .sort((a,b) => parseTime(a.in_time) - parseTime(b.in_time));
            const currentStart = parseTime(s.in_time);
            const currentEnd = parseTime(s.out_time);
            let prevEndBound = parseTime(ch.in_time);
            let nextStartBound = parseTime(ch.out_time);
            for (let i = 0; i < others.length; i++) {
              const o = others[i];
              const oStart = parseTime(o.in_time);
              const oEnd = parseTime(o.out_time);
              if (oEnd <= currentStart && oEnd > prevEndBound) prevEndBound = oEnd;
              if (oStart >= currentEnd && oStart < nextStartBound) nextStartBound = oStart;
            }
            const minStart = prevEndBound;
            const maxStart = Math.max(minStart, nextStartBound - width);
            // Snap to neighbor edges
            if (Math.abs(ns - minStart) <= SNAP_THRESHOLD_SEC) ns = minStart;
            if (Math.abs(ns - maxStart) <= SNAP_THRESHOLD_SEC) ns = maxStart;
            ns = clamp(ns, minStart, maxStart);
            
            return { ...s, in_time: formatTime(ns), out_time: formatTime(ns + width) };
          })
        };
      }

      if (resize && ch.id === resize.chapterId) {
        if (resize.type === "chapter" && ch.id === resize.id) {
          if (resize.edge === "L") {
            // Left resize: clamp to previous chapter end to avoid overlap
            const minWidth = 1;
            const others = prev.filter(o => o.id !== ch.id).sort((a,b)=>parseTime(a.in_time)-parseTime(b.in_time));
            let prevEndBound = 0;
            for (let i = 0; i < others.length; i++) {
              const oEnd = parseTime(others[i].out_time);
              if (oEnd <= parseTime(ch.in_time) && oEnd > prevEndBound) prevEndBound = oEnd;
            }
            const upper = parseTime(ch.out_time) - minWidth;
            let newStart = clamp(sec(e.clientX), prevEndBound, upper);
            if (Math.abs(newStart - prevEndBound) <= SNAP_THRESHOLD_SEC) newStart = prevEndBound;
            const delta = newStart - parseTime(ch.in_time);
            const chEnd = parseTime(ch.out_time);
            // shift speakers the same amount to maintain relative placement
            return {
              ...ch,
              in_time: formatTime(newStart),
              out_time: ch.out_time,
              speakers: ch.speakers.map(s => {
                const sStart = clamp(parseTime(s.in_time) + delta, newStart, chEnd);
                const sEnd = clamp(parseTime(s.out_time) + delta, sStart + 0.1, chEnd);
                return { ...s, in_time: formatTime(sStart), out_time: formatTime(sEnd) };
              })
            };
          } else {
            // Right resize: clamp to next chapter start to avoid overlap
            const minWidth = 1;
            const others = prev.filter(o => o.id !== ch.id).sort((a,b)=>parseTime(a.in_time)-parseTime(b.in_time));
            let nextStartBound = totalDuration;
            for (let i = 0; i < others.length; i++) {
              const oStart = parseTime(others[i].in_time);
              if (oStart >= parseTime(ch.out_time) && oStart < nextStartBound) nextStartBound = oStart;
            }
            const lower = parseTime(ch.in_time) + minWidth;
            let newEnd = clamp(sec(e.clientX), lower, nextStartBound);
            if (Math.abs(newEnd - nextStartBound) <= SNAP_THRESHOLD_SEC) newEnd = nextStartBound;
            // also clamp speakers to new end
            return {
              ...ch,
              in_time: ch.in_time,
              out_time: formatTime(newEnd),
              speakers: ch.speakers.map(s => {
                const sStart = Math.min(parseTime(s.in_time), newEnd - 1);
                const sEnd = clamp(parseTime(s.out_time), sStart + 0.1, newEnd);
                return { ...s, in_time: formatTime(sStart), out_time: formatTime(sEnd) };
              })
            };
          }
        }
        if (resize.type === "speaker") {
          return {
            ...ch,
            speakers: ch.speakers.map(s => {
              if (s.id !== resize.id) return s;
              if (resize.edge === "L") {
                // Left edge: cannot cross previous speaker's end
                const others = ch.speakers.filter(os => os.id !== s.id)
                  .sort((a,b) => parseTime(a.in_time) - parseTime(b.in_time));
                let prevEndBound = parseTime(ch.in_time);
                for (let i = 0; i < others.length; i++) {
                  const o = others[i];
                  const oEnd = parseTime(o.out_time);
                  if (oEnd <= parseTime(s.in_time) && oEnd > prevEndBound) prevEndBound = oEnd;
                }
                const upper = parseTime(s.out_time) - 0.1;
                let newStart = clamp(sec(e.clientX), prevEndBound, upper);
                if (Math.abs(newStart - prevEndBound) <= SNAP_THRESHOLD_SEC) newStart = prevEndBound;
                return { ...s, in_time: formatTime(newStart) };
              } else {
                // Right edge: cannot cross next speaker's start
                const others = ch.speakers.filter(os => os.id !== s.id)
                  .sort((a,b) => parseTime(a.in_time) - parseTime(b.in_time));
                let nextStartBound = parseTime(ch.out_time);
                for (let i = 0; i < others.length; i++) {
                  const o = others[i];
                  const oStart = parseTime(o.in_time);
                  if (oStart >= parseTime(s.out_time) && oStart < nextStartBound) nextStartBound = oStart;
                }
                const lower = parseTime(s.in_time) + 0.1;
                let newEnd = clamp(sec(e.clientX), lower, nextStartBound);
                if (Math.abs(newEnd - nextStartBound) <= SNAP_THRESHOLD_SEC) newEnd = nextStartBound;
                return { ...s, out_time: formatTime(newEnd) };
              }
            })
          };
        }
      }
      return ch;
    }));
  };
  const onMouseUp = () => { setDragId(null); setResize(null); };

  // Zoom
  const zoom = (factor: number) => setScale(s => clamp(s * factor, 0.2, 80));

  // Helpers: active highlighting
  const isActiveInterval = (t: number, a: number, b: number) => t >= a && t < b;

  if (!isOpen) return null;

  return (
    <div className={css.overlay} onMouseMove={onMouseMove} onMouseUp={onMouseUp}>
      <div className={css.modal}>
        {/* Header */}
        <div className={css.header}>
          <div style={{ display:"flex", gap:12, alignItems:"center" }}>
            <strong>Studio Timeline</strong>
            <span style={{ color: "#9ca3af", fontSize:12 }}>
              {Math.floor(totalDuration/3600)}h {(Math.floor(totalDuration/60)%60)}m
            </span>
          </div>
          <div style={{ display:"flex", gap:12, alignItems:"center" }}>
            {/* Speaker controls moved to the right to avoid accidental taps */}
            <label style={{ display:"flex", alignItems:"center", gap:6, color:"#e5e7eb", fontSize:12 }}>
              <input type="checkbox" checked={showSpeakers} onChange={e=>setShowSpeakers(e.target.checked)} /> Show speakers
            </label>
            <select
              value={selectedCategory}
              onChange={e=>onCategoryChange(e.target.value)}
              style={{ background:'#111827', color:'#e5e7eb', border:'1px solid #374151', borderRadius:6, padding:'4px 8px' }}
              title="Speaker category (changing clears all speakers)"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <button className={button} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Top: left list + video */}
        <div className={css.top}>
          <div className={css.leftPane}>
            <div className={css.leftPaneHeader}>
              <span>Chapters & Speakers</span>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <button className={button} onClick={()=>addChapterAt(currentTime)}>+ Chapter @ Playhead</button>
                <input
                  type="text"
                  placeholder="Quick add title..."
                  onKeyDown={(e)=>{
                    const input = e.currentTarget as HTMLInputElement;
                    if (e.key === 'Enter' && input.value.trim()) {
                      const title = input.value.trim();
                      const id = crypto.randomUUID();
                      const start = chapters.length ? Math.max(...chapters.map(c=>parseTime(c.out_time))) : 0;
                      const end = start + 60;
                      const newCh = { id, title, description: "", in_time: formatTime(start), out_time: formatTime(end), order: 0, source: 'source', speakers: [] } as Chapter;
                      setChapters(prev => [...prev, newCh].sort((a,b)=>parseTime(a.in_time)-parseTime(b.in_time)));
                      input.value = "";
                    }
                  }}
                  style={{ background:'#111827', color:'#e5e7eb', border:'1px solid #374151', borderRadius:6, padding:'6px 8px', width:180 }}
                />
                {onOpenAdvancedChapterModal && (
                  <button className={button} onClick={()=>onOpenAdvancedChapterModal()}>Advanced…</button>
                )}
              </div>
            </div>
            {chapters.sort((a,b)=>parseTime(a.in_time)-parseTime(b.in_time)).map(ch=>(
              <div key={ch.id} style={{ borderBottom:`1px solid #1f2937` }}>
                <div className={css.speakerItem} style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                  <div style={{ color:"#e5e7eb", fontWeight:600 }}>{ch.title}</div>
                  <div style={{ color:"#9ca3af", fontSize:12 }}>
                      {(parseTime(ch.out_time)-parseTime((ch.in_time))).toFixed(1)}s — {ch.description ?? "No description"}
                  </div>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                  <button className={button} onClick={(e)=>{ e.stopPropagation(); openChapterEditor(ch.id); }}>
                    Edit
                  </button>
                  {showSpeakers && (
                    <button className={button} onClick={()=>addSpeakerToChapter(ch.id, currentTime, selectedCategory)}>+ Speakers</button>
                  )}
                  <button className={button} style={{ color:"#ef4444" }} onClick={()=>deleteChapter(ch.id)}>✕</button>
                  </div>
                </div>
                {showSpeakers && ch.speakers.map(sp=>(
                  <div key={sp.id} className={css.speakerItem} style={{ paddingLeft:18 }}>
                  <div style={{ color:"#e5e7eb" }}>{sp.speaker_name}</div>
                  <div style={{ color:"#9ca3af", fontSize:12 }}>
                    {parseTime(sp.in_time).toFixed(1)}s → {parseTime(sp.out_time).toFixed(1)}s
                  </div>
                  </div>
                ))}
              </div>            
            ))}
          </div>

          <div className={css.rightPane}>
            <div style={{ width:"100%", aspectRatio:"16 / 9", background:"#000", display:"flex", alignItems:"center", justifyContent:"center", position:"relative" }}>
              <video
                ref={videoRef}
                src={videoSrc}
                controls
                onTimeUpdate={(e)=> setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                onPlay={()=> setPlaying(true)}
                onPause={()=> setPlaying(false)}
                style={{ 
                  width:"100%", 
                  height:"100%", 
                  objectFit:"contain", 
                  background:"#000",
                  display:"block"
                }}
              />
            </div>
          </div>
        </div>

        {/* Bottom: controls + ruler + tracks */}
        <div className={css.bottom} style={{ marginTop: "16px" }}>
          {/* Inline fallback chapter editor */}
          {editorChapterId && (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.6)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1100 }} onMouseDown={closeInlineEditor}>
              <div style={{ background:'#111827', border:'1px solid #374151', borderRadius:8, width:520, padding:16 }} onMouseDown={(e)=>e.stopPropagation()}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <strong style={{ color:'#e5e7eb' }}>Edit Chapter</strong>
                  <button className={button} onClick={closeInlineEditor}>✕</button>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <label style={{ color:'#9ca3af', fontSize:12 }}>Title</label>
                  <input value={editTitle} onChange={e=>setEditTitle(e.target.value)} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #374151', borderRadius:6, padding:'8px' }} />
                  <label style={{ color:'#9ca3af', fontSize:12 }}>Description</label>
                  <textarea value={editDescription} onChange={e=>setEditDescription(e.target.value)} rows={6} style={{ background:'#0b1220', color:'#e5e7eb', border:'1px solid #374151', borderRadius:6, padding:'8px', resize:'vertical' }} />
                </div>
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:14 }}>
                  <button className={button} onClick={closeInlineEditor}>Cancel</button>
                  <button className={button} onClick={saveInlineEditor}>Save</button>
                </div>
              </div>
            </div>
          )}
          {/* Context menu */}
          {contextMenu && (
            <div
              style={{
                position: "fixed",
                left: contextMenu.x,
                top: contextMenu.y,
                background: "#111827",
                border: "1px solid #374151",
                borderRadius: 6,
                color: "#e5e7eb",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                zIndex: 1000,
                padding: 4,
                minWidth: 160
              }}
              ref={menuRef}
              onMouseDown={(e)=>e.stopPropagation()}
            >
              {contextMenu.track === "chapter" && (
                <button
                  className={button}
                  style={{ width:"100%" }}
                  onClick={() => {
                    addChapterAt(contextMenu.t);
                    setContextMenu(null);
                  }}
                >
                  + Add Chapter here
                </button>
              )}
              {contextMenu.track === "speaker" && (
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  {visibleChapters.map(c => (
                    <button
                      key={c.id}
                      className={button}
                      style={{ textAlign:"left" }}
                      onClick={() => {
                        addSpeakerToChapter(c.id, contextMenu.t, selectedCategory);
                        setContextMenu(null);
                      }}
                    >
                      + Add Speaker here in: {c.title}
                    </button>
                  ))}
                  {!visibleChapters.length && (
                    <div style={{ padding:6, color:"#9ca3af", fontSize:12 }}>No chapter in view</div>
                  )}
                </div>
              )}
            </div>
          )}
          <div className={css.controls}>
            <button className={button} onClick={()=>{
              if (!videoRef.current) return;
              if (videoRef.current.paused) videoRef.current.play(); else videoRef.current.pause();
            }}>{playing ? "Pause" : "Play"}</button>
            <button className={button} onClick={()=>{
              if (!videoRef.current) return;
              videoRef.current.currentTime = clamp(currentTime - 5, 0, totalDuration);
            }}>⟲ -5s</button>
            <button className={button} onClick={()=>{
              if (!videoRef.current) return;
              videoRef.current.currentTime = clamp(currentTime + 5, 0, totalDuration);
            }}>+5s ⟳</button>
            <button className={button} onClick={()=>zoom(1/1.2)}>− Zoom</button>
            <button className={button} onClick={()=>zoom(1.2)}>+ Zoom</button>
            <button className={button} onClick={exportTimelineData}>Export Timeline</button>
            <span style={{ color:"#9ca3af", fontSize:12, marginLeft:8 }}>
              t={currentTime.toFixed(2)}s • scale={scale.toFixed(2)}px/s • width={(px(totalDuration)/1000).toFixed(1)}k px
            </span>
          </div>

          {/* Ruler */}
          <div
            className={css.rulerWrapper}
            ref={(el) => {
              if (!el) return;
              const trackScroll = document.getElementById("timeline-scroll");
              if (trackScroll) {
                trackScroll.addEventListener("scroll", () => {
                  el.scrollLeft = trackScroll.scrollLeft;
                });
              }
            }}
          >
            <div className={css.ruler} style={{ width: `${totalDuration * scale}px` }} onClick={onRulerClick}>
              {Array.from({ length: Math.floor(totalDuration / tickStep) + 1 }).map((_,i)=>{
                const t = i * tickStep;
                return (
                  <div key={t} className={css.tick} style={{ left: px(t) }}>
                    <span>{formatRulerTime(t)}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Scrollable tracks */}
          <div id="timeline-scroll" className={css.scrollArea} ref={scrollRef}>
            <div className={css.content} ref={contentRef} style={{ width: px(totalDuration) }}>
              {/* Track Headers */}
              <div style={{ position: "sticky", top: 0, background: "#111827", zIndex: 10, borderBottom: "1px solid #374151", padding: "8px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, paddingLeft: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
                    <div style={{ width: 12, height: 12, background: "#3b82f6", borderRadius: 2 }} />
                    <span style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 600 }}>Chapters</span>
                  </div>
                  {showSpeakers && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
                      <div style={{ width: 12, height: 12, background: "#10b981", borderRadius: 2 }} />
                      <span style={{ color: "#e5e7eb", fontSize: 12, fontWeight: 600 }}>Speakers</span>
                    </div>
                  )}
                </div>
              </div>

              {/* CHAPTER track */}
              <div className={css.track} onContextMenu={(e)=>onTrackContextMenu(e, "chapter") } style={{ position: "relative", minHeight: 40 }}>
                {chapters.length === 0 ? (
                  <div style={{ 
                    position: "absolute", 
                    top: "50%", 
                    left: "50%", 
                    transform: "translate(-50%, -50%)", 
                    color: "#9ca3af", 
                    fontSize: 14, 
                    textAlign: "center",
                    pointerEvents: "none"
                  }}>
                    <div style={{ marginBottom: 8 }}>📖 No chapters yet</div>
                    <div style={{ fontSize: 12 }}>Right-click here or use "+ Chapter @ Playhead" to add your first chapter</div>
                  </div>
                ) : (
                  chapters.map((ch) => (
                    <div
                      key={ch.id}
                      className={css.segment}
                      onClick={() => setSelected({ type: "chapter", id: ch.id })}
                      onMouseDown={(e)=>beginDrag(e, "chapter", ch.id, ch.id, parseTime(ch.in_time))}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: `${toPixels(parseTime(ch.in_time))}px`,
                        width: `${(parseTime(ch.out_time) - parseTime(ch.in_time)) * scale}px`,
                        background: "#3b82f6",
                        border: selected?.type === "chapter" && selected.id === ch.id 
                          ? "2px solid #facc15"
                          : "1px solid #60a5fa",
                        boxShadow: "inset -2px 0 0 #1e40af, inset 2px 0 0 #1e40af"
                      }}
                    >
                      {/* Left handle */}
                      <div className={css.handleL} onMouseDown={(e)=>beginResize(e, "L", "chapter", ch.id, ch.id)} />
                      {ch.title}
                      {/* Right handle */}
                      <div className={css.handleR} onMouseDown={(e)=>beginResize(e, "R", "chapter", ch.id, ch.id)} />
                      {/* End cap marker */}
                      <div style={{ position:"absolute", right:0, top:0, height:"100%", width:2, background:"#f59e0b" }} />
                    </div>
                  ))
                )}
              </div>

              {/* SPEAKER track (virtualized by chapter + within visible window) */}
              {showSpeakers && (
                <div className={css.track} onContextMenu={(e)=>onTrackContextMenu(e, "speaker") } style={{ position: "relative", minHeight: 40 }}>
                  {(() => {
                    const allSpeakers = chapters.flatMap(ch => ch.speakers);
                    const visibleSpeakers = visibleChapters.flatMap(ch =>
                      ch.speakers.filter(s => parseTime(s.out_time) >= visibleRange.start && parseTime(s.in_time) <= visibleRange.end)
                    );
                    
                    if (allSpeakers.length === 0) {
                      return (
                        <div style={{ 
                          position: "absolute", 
                          top: "50%", 
                          left: "50%", 
                          transform: "translate(-50%, -50%)", 
                          color: "#9ca3af", 
                          fontSize: 14, 
                          textAlign: "center",
                          pointerEvents: "none"
                        }}>
                          <div style={{ marginBottom: 8 }}>🎤 No speakers yet</div>
                          <div style={{ fontSize: 12 }}>Right-click here or use "+ Speakers" to add speakers from the selected category</div>
                        </div>
                      );
                    }
                    
                    return visibleSpeakers.map(s => {
                      const ch = chapters.find(c => c.speakers.some(sp => sp.id === s.id));
                      if (!ch) return null;
                      const active = isActiveInterval(currentTime, parseTime(s.in_time), parseTime(s.out_time));
                      return (
                        <div
                          key={s.id}
                          className={[
                            css.segment, css.segSpeaker, active ? css.active : undefined
                          ].filter(Boolean).join(" ")}
                          onClick={() => setSelected({ type: "speaker", id: s.id })}
                          style={{ left: px(parseTime(s.in_time)),
                            width: px(parseTime(s.out_time) - parseTime(s.in_time)),
                            border: selected?.type === "speaker" && selected.id === s.id 
                            ? "2px solid #facc15"
                            : "1px solid transparent", }}
                          onMouseDown={(e)=>beginDrag(e,"speaker", ch.id, s.id, parseTime(s.in_time))}
                          title={`${s.speaker_name}`}
                        >
                          <div className={css.handleL} onMouseDown={(e)=>beginResize(e,"L","speaker", ch.id, s.id)} />
                          {s.speaker_name}
                          <div className={css.handleR} onMouseDown={(e)=>beginResize(e,"R","speaker", ch.id, s.id)} />
                        </div>
                      );
                    });
                  })()}
                </div>
              )}

              {/* Playhead */}
              <div className={css.playhead} style={{ left: px(currentTime) }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(t: number) {
  const h = Math.floor(t/3600);
  const m = Math.floor((t%3600)/60);
  const s = Math.floor(t%60);
  if (h) return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${m}:${String(s).padStart(2,"0")}`;
}

function formatRulerTime(t: number) {
  const total = Math.floor(t);
  if (total < 60) {
    return `${total}s`;
  }
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (total < 3600) {
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${String(mm).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
