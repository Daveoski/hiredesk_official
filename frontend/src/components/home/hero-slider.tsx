"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// Photos from Unsplash (free licence), stored in /public so the hero never depends on another site.
const slides = [
  { src: "/images/hero/hero-1.jpg", caption: "Panel interview", alt: "A Nigerian hiring panel interviews a candidate around a meeting table" },
  { src: "/images/hero/hero-2.jpg", caption: "Candidate conversation", alt: "A candidate in a white shirt and red tie listens closely during an interview" },
  { src: "/images/hero/hero-3.jpg", caption: "Shortlist review", alt: "Three colleagues discuss candidates over their laptops" },
  { src: "/images/hero/hero-4.jpg", caption: "One-on-one interview", alt: "A hiring manager and a candidate in conversation" },
  { src: "/images/hero/hero-5.jpg", caption: "Team debrief", alt: "A team lead presents interview findings to colleagues" },
  { src: "/images/hero/hero-6.jpg", caption: "Hiring manager sync", alt: "A team listens during a hiring meeting" },
  { src: "/images/hero/hero-7.jpg", caption: "Ready to assess", alt: "A professional woman in a hijab holds a tablet in a modern office" },
  { src: "/images/hero/hero-8.jpg", caption: "New hires, welcomed", alt: "Two smiling young professionals at a desk with a laptop" },
  { src: "/images/hero/hero-9.jpg", caption: "Decisions, together", alt: "A team of women meets around a conference table with laptops" },
];

const SLIDE_MS = 6000;

export function HeroSlider() {
  // The outgoing slide keeps its zoom while it fades, so the photo never jumps mid-transition.
  const [{ active, previous }, setSlides] = useState<{ active: number; previous: number | null }>({ active: 0, previous: null });
  const [paused, setPaused] = useState(false);
  const [tabHidden, setTabHidden] = useState(false);
  const running = !paused && !tabHidden;

  const show = useCallback(
    (pick: (index: number) => number) =>
      setSlides((current) => {
        const next = pick(current.active);
        return next === current.active ? current : { active: next, previous: current.active };
      }),
    [],
  );
  const go = useCallback((step: number) => show((index) => (index + step + slides.length) % slides.length), [show]);

  // Stop the clock while the tab is hidden, so people come back to the slide they left.
  useEffect(() => {
    const onVisibility = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  return (
    <>
      <div aria-hidden="true" className="absolute inset-0 -z-20 overflow-hidden bg-[#17201d]">
        {slides.map((slide, index) => (
          <div
            key={slide.src}
            className={cn(
              "absolute inset-0 transition-opacity duration-[1400ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
              index === active ? "opacity-100" : "opacity-0",
            )}
          >
            <Image
              src={slide.src}
              alt=""
              fill
              sizes="100vw"
              quality={72}
              priority={index === 0}
              className={cn("object-cover", (index === active || index === previous) && (index % 2 ? "hero-kenburns-b" : "hero-kenburns-a"))}
            />
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">
        Photo {active + 1} of {slides.length}: {slides[active].alt}
      </p>

      <div className="flex items-center gap-4">
        <span key={active} className="hero-caption hidden min-w-40 text-xs font-semibold uppercase tracking-[0.18em] text-white/85 sm:inline">
          {String(active + 1).padStart(2, "0")} · {slides[active].caption}
        </span>
        <div className="flex flex-1 items-center gap-1.5" role="group" aria-label="Choose a photo">
          {slides.map((slide, index) => (
            <button
              key={slide.src}
              type="button"
              onClick={() => show(() => index)}
              aria-label={`Show photo ${index + 1}: ${slide.caption}`}
              aria-current={index === active}
              className="group relative h-6 flex-1"
            >
              <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-full bg-white/25 transition group-hover:bg-white/45">
                <span
                  key={index === active ? `run-${active}` : "idle"}
                  className={cn(
                    "absolute inset-0 origin-left rounded-full bg-[#e6f18f]",
                    index < active && "scale-x-100",
                    index > active && "scale-x-0",
                    index === active && "hero-progress",
                  )}
                  // The progress bar is the clock: when it fills, move on. Pausing it pauses the slideshow.
                  onAnimationEnd={index === active ? () => go(1) : undefined}
                  style={index === active ? { animationDuration: `${SLIDE_MS}ms`, animationPlayState: running ? "running" : "paused" } : undefined}
                />
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="hero-control">
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => setPaused((value) => !value)} aria-label={paused ? "Play slideshow" : "Pause slideshow"} className="hero-control">
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Next photo" className="hero-control">
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </>
  );
}
