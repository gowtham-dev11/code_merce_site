import React, { useEffect, useRef, useCallback, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import {
  ALL_FRAMES,
  TOTAL_FRAME_COUNT,
  ORIGINAL_WIDTH,
  ORIGINAL_HEIGHT,
} from '../data/frames';
import {
  ArrowRight,
  ChevronDown,
  Instagram,
  Linkedin,
  Github,
  Twitter,
} from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

// Configure ScrollTrigger for mobile stability (prevents jumpiness when browser toolbar collapses)
ScrollTrigger.config({
  ignoreMobileResize: true,
  autoRefreshEvents: 'visibilitychange,DOMContentLoaded,load',
});

/**
 * Calculates the horizontal focal center (in 1920px image coordinates) of the bunny character.
 * Derived from frame bounding-box analysis:
 * - Clip 1 (0..59): Bunny walks from center (x ≈ 1113) to right (x ≈ 1579).
 * - Clip 2 (60..99): Bunny turns & points left (x ≈ 1595 to 1522).
 */
function getBunnyFocalX(globalIndex: number): number {
  if (globalIndex <= 59) {
    const t = globalIndex / 59;
    return 1113 + t * (1579 - 1113);
  } else {
    const t = (globalIndex - 60) / 39;
    return 1595 + t * (1522 - 1595);
  }
}

export const BunnyScrollAnimation: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Content overlay refs for high-performance direct style updates without re-renders
  const homeOverlayRef = useRef<HTMLDivElement>(null);
  const aboutOverlayRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<string>('HOME');

  // In-memory cache of HTMLImageElements (single instances, reused)
  const imagesRef = useRef<(HTMLImageElement | null)[]>(new Array(TOTAL_FRAME_COUNT).fill(null));
  const currentFrameRef = useRef<number>(0);
  const isLoadedMapRef = useRef<boolean[]>(new Array(TOTAL_FRAME_COUNT).fill(false));

  // State for active navbar tab and accessibility
  const [activeTab, setActiveTab] = useState<string>('HOME');
  const [prefersReducedMotion, setPrefersReducedMotion] = useState<boolean>(false);
  const [manualFrameIndex, setManualFrameIndex] = useState<number>(0);

  // Check reduced motion preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  /**
   * Responsive Canvas Frame Renderer
   * Automatically adapts composition between:
   * 1. Landscape / Desktop (aspect >= 1.2): Cinematic cover composition.
   * 2. Portrait Phones / Tablets (aspect < 1.2): Dynamic focal-point tracking so the
   *    bunny's head, ears, body, and feet remain completely visible without leaving the screen.
   */
  const renderFrame = useCallback((frameIndex: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    // Retrieve target image or nearest loaded neighbor
    let imgToDraw: HTMLImageElement | null = imagesRef.current[frameIndex] || null;
    if (!imgToDraw || !imgToDraw.complete || imgToDraw.naturalWidth === 0) {
      for (let offset = 1; offset < TOTAL_FRAME_COUNT; offset++) {
        const prev = frameIndex - offset;
        const next = frameIndex + offset;
        if (prev >= 0 && imagesRef.current[prev]?.complete && imagesRef.current[prev]?.naturalWidth !== 0) {
          imgToDraw = imagesRef.current[prev];
          break;
        }
        if (next < TOTAL_FRAME_COUNT && imagesRef.current[next]?.complete && imagesRef.current[next]?.naturalWidth !== 0) {
          imgToDraw = imagesRef.current[next];
          break;
        }
      }
    }

    if (!imgToDraw || !imgToDraw.complete || imgToDraw.naturalWidth === 0) {
      return;
    }

    const canvasW = canvas.width;
    const canvasH = canvas.height;
    if (canvasW === 0 || canvasH === 0) return;

    const canvasAspect = canvasW / canvasH;

    let drawW: number;
    let drawH: number;
    let drawX: number;
    let drawY: number;

    if (canvasAspect >= 1.2) {
      // LANDSCAPE / DESKTOP / TABLET LANDSCAPE: Full widescreen cover
      const scale = Math.max(canvasW / ORIGINAL_WIDTH, canvasH / ORIGINAL_HEIGHT);
      drawW = ORIGINAL_WIDTH * scale;
      drawH = ORIGINAL_HEIGHT * scale;
      drawX = (canvasW - drawW) / 2;
      drawY = (canvasH - drawH) / 2;
    } else {
      // PORTRAIT PHONES & TABLETS:
      // Fit full height to ensure bunny's ears, body, and feet are completely in view
      const scale = canvasH / ORIGINAL_HEIGHT;
      drawW = ORIGINAL_WIDTH * scale;
      drawH = canvasH;
      drawY = 0;

      // Center horizontally on the bunny's calculated focal point for this frame
      const focalX = getBunnyFocalX(frameIndex) * scale;
      const targetX = (canvasW / 2) - focalX;

      // Clamp horizontal draw position so no black/empty gaps appear beyond image borders
      const minX = canvasW - drawW; // Right image edge touches screen right
      const maxX = 0;               // Left image edge touches screen left
      drawX = Math.max(minX, Math.min(maxX, targetX));
    }

    // Direct draw without clearing to black (preserves authentic lighting & visual continuity)
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgToDraw, drawX, drawY, drawW, drawH);

    currentFrameRef.current = frameIndex;
  }, []);

  /**
   * Resizes canvas backing buffer based on window viewport dimensions and devicePixelRatio.
   * Capped at DPR = 2 to prevent excessive GPU memory consumption on high-density mobile screens.
   */
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const targetW = Math.round(w * dpr);
    const targetH = Math.round(h * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
      renderFrame(currentFrameRef.current);
    }
  }, [renderFrame]);

  // Progressive, controlled image preloading suitable for mobile networks
  useEffect(() => {
    let isCancelled = false;

    const loadFrame = (idx: number): Promise<void> => {
      return new Promise((resolve) => {
        if (imagesRef.current[idx]?.complete) {
          resolve();
          return;
        }
        const img = new Image();
        img.src = ALL_FRAMES[idx].url;
        img.onload = () => {
          if (isCancelled) return;
          imagesRef.current[idx] = img;
          isLoadedMapRef.current[idx] = true;

          // Draw frame 0 immediately when loaded
          if (idx === 0) {
            resizeCanvas();
            renderFrame(0);
          }
          resolve();
        };
        img.onerror = () => {
          console.warn(`[BunnyScroll] Failed to load frame ${idx}: ${ALL_FRAMES[idx].url}`);
          resolve();
        };
      });
    };

    const preloadAll = async () => {
      // 1. Immediately load frame 0
      await loadFrame(0);
      if (isCancelled) return;

      // 2. Load keyframes across both clips
      const keyframes = [10, 20, 30, 40, 50, 59, 60, 70, 80, 90, 99];
      await Promise.all(keyframes.map(loadFrame));
      if (isCancelled) return;

      // 3. Concurrently load remaining frames in small batches of 6 (mobile-friendly)
      const remaining: number[] = [];
      for (let i = 0; i < TOTAL_FRAME_COUNT; i++) {
        if (!imagesRef.current[i]) remaining.push(i);
      }

      const BATCH_SIZE = 6;
      for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
        if (isCancelled) return;
        await Promise.all(remaining.slice(i, i + BATCH_SIZE).map(loadFrame));
      }
    };

    preloadAll();

    return () => {
      isCancelled = true;
    };
  }, [renderFrame, resizeCanvas]);

  // Window resize & orientation change handler
  useEffect(() => {
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;

    const handleWindowResize = () => {
      const currentW = window.innerWidth;
      const currentH = window.innerHeight;

      const widthChanged = Math.abs(currentW - lastWidth) > 5;
      const heightChangedSignificantly = Math.abs(currentH - lastHeight) > 120;

      lastWidth = currentW;
      lastHeight = currentH;

      resizeCanvas();

      if (widthChanged || heightChangedSignificantly) {
        ScrollTrigger.refresh();
      }
    };

    window.addEventListener('resize', handleWindowResize);
    window.addEventListener('orientationchange', handleWindowResize);
    resizeCanvas();

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('orientationchange', handleWindowResize);
    };
  }, [resizeCanvas]);

  // Reset scroll to top on fresh mount
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual';
    }
  }, []);

  // GSAP ScrollTrigger Pinned Scrub Animation with synchronized Home -> About crossfade
  useEffect(() => {
    if (!containerRef.current || !stageRef.current) return;

    const isMobile = window.innerWidth < 768;
    const scrollDistance = isMobile ? 4200 : 6000;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: containerRef.current,
        pin: stageRef.current,
        start: 'top top',
        end: `+=${scrollDistance}`,
        scrub: isMobile ? 0.6 : 1.0,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: (self) => {
          const progress = self.progress; // 0 to 1

          // 1. Map progress to 100 frames
          const targetFrame = Math.min(
            TOTAL_FRAME_COUNT - 1,
            Math.max(0, Math.floor(progress * TOTAL_FRAME_COUNT))
          );

          if (targetFrame !== currentFrameRef.current) {
            renderFrame(targetFrame);
            setManualFrameIndex(targetFrame);
          }

          // 2. Synchronize Home & About text transitions directly via DOM styles
          // STRICT GUARANTEE: Non-overlapping, sequential handoff with smoothstep easing
          if (homeOverlayRef.current && aboutOverlayRef.current) {
            let homeOp = 1;
            let homeY = 0;
            let homeVis: 'visible' | 'hidden' = 'visible';
            let homePointer: 'auto' | 'none' = 'auto';

            let aboutOp = 0;
            let aboutY = 24;
            let aboutVis: 'visible' | 'hidden' = 'hidden';
            let aboutPointer: 'auto' | 'none' = 'none';

            if (progress <= 0.16) {
              // Phase 1: Pure Home State (progress 0.00 - 0.16)
              homeOp = 1;
              homeY = 0;
              homeVis = 'visible';
              homePointer = 'auto';

              aboutOp = 0;
              aboutY = 24;
              aboutVis = 'hidden';
              aboutPointer = 'none';
            } else if (progress > 0.16 && progress <= 0.35) {
              // Phase 2: Home smoothly exits (progress 0.16 - 0.35)
              // Bunny walks from center to right
              const t = (progress - 0.16) / 0.19; // 0 -> 1
              const smoothT = t * t * (3 - 2 * t); // Smoothstep easing
              homeOp = Math.max(0, 1 - smoothT);
              homeY = -24 * smoothT;
              homeVis = homeOp > 0.01 ? 'visible' : 'hidden';
              homePointer = homeOp > 0.4 ? 'auto' : 'none';

              // About is strictly 0 and hidden during Home's exit
              aboutOp = 0;
              aboutY = 24;
              aboutVis = 'hidden';
              aboutPointer = 'none';
            } else if (progress > 0.35 && progress <= 0.40) {
              // Phase 3: Clean Separation Window (progress 0.35 - 0.40)
              // Zero visual collision: Home has completely reached 0, About not yet entering
              homeOp = 0;
              homeY = -24;
              homeVis = 'hidden';
              homePointer = 'none';

              aboutOp = 0;
              aboutY = 24;
              aboutVis = 'hidden';
              aboutPointer = 'none';
            } else if (progress > 0.40 && progress <= 0.58) {
              // Phase 4: About smoothly enters (progress 0.40 - 0.58)
              // Bunny reaches right side and begins pointing pose
              const t = (progress - 0.40) / 0.18; // 0 -> 1
              const smoothT = t * t * (3 - 2 * t); // Smoothstep easing
              aboutOp = Math.min(1, smoothT);
              aboutY = 24 * (1 - smoothT);
              aboutVis = aboutOp > 0.01 ? 'visible' : 'hidden';
              aboutPointer = aboutOp > 0.4 ? 'auto' : 'none';

              // Home remains strictly 0 and hidden
              homeOp = 0;
              homeY = -24;
              homeVis = 'hidden';
              homePointer = 'none';
            } else {
              // Phase 5: Pure About State (progress 0.58 - 1.00)
              // Bunny points left, About fully settled
              homeOp = 0;
              homeY = -24;
              homeVis = 'hidden';
              homePointer = 'none';

              aboutOp = 1;
              aboutY = 0;
              aboutVis = 'visible';
              aboutPointer = 'auto';
            }

            homeOverlayRef.current.style.opacity = String(homeOp);
            homeOverlayRef.current.style.transform = `translate3d(0, ${homeY}px, 0)`;
            homeOverlayRef.current.style.visibility = homeVis;
            homeOverlayRef.current.style.pointerEvents = homePointer;

            aboutOverlayRef.current.style.opacity = String(aboutOp);
            aboutOverlayRef.current.style.transform = `translate3d(0, ${aboutY}px, 0)`;
            aboutOverlayRef.current.style.visibility = aboutVis;
            aboutOverlayRef.current.style.pointerEvents = aboutPointer;

            // Update active navbar indicator at the handoff point
            const newTab = progress >= 0.38 ? 'ABOUT' : 'HOME';
            if (newTab !== activeTabRef.current) {
              activeTabRef.current = newTab;
              setActiveTab(newTab);
            }
          }
        },
      });
    }, containerRef);

    return () => {
      ctx.revert();
    };
  }, [renderFrame]);

  // Smooth scroll helper for navbar clicks
  const scrollToSection = (section: 'HOME' | 'ABOUT') => {
    if (section === 'HOME') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (section === 'ABOUT') {
      const isMobile = window.innerWidth < 768;
      const scrollDist = isMobile ? 4200 * 0.65 : 6000 * 0.65;
      window.scrollTo({ top: scrollDist, behavior: 'smooth' });
    }
  };

  // Manual scrub slider handler for users with prefers-reduced-motion
  const handleReducedMotionScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    setManualFrameIndex(val);
    renderFrame(val);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-[#030712]"
      style={{ minHeight: '100dvh' }}
    >
      {/* 
        Full-screen pinned stage:
        Contains canvas and synchronized Home/About overlays.
      */}
      <div
        ref={stageRef}
        className="w-screen h-screen overflow-hidden bg-[#030712] flex items-center justify-center mobile-stage relative"
        style={{
          width: '100vw',
          height: '100dvh',
          position: 'relative',
        }}
      >
        {/* Canvas renderer displaying the authentic 100-frame sequence */}
        <canvas
          ref={canvasRef}
          id="bunny-canvas"
          className="w-full h-full block pointer-events-none"
          style={{
            width: '100vw',
            height: '100dvh',
            maxWidth: 'none',
            maxHeight: 'none',
            display: 'block',
          }}
        />

        {/* 
          =======================================================
          TOP NAVIGATION HEADER (Futuristic, Gamified Glass Bar)
          =======================================================
        */}
        <header className="site-header fixed top-0 left-0 right-0 z-50 px-6 sm:px-10 lg:px-16 py-4 sm:py-5 lg:py-6 flex items-center justify-between pointer-events-auto">
          {/* Brand Logo & Association Badge */}
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <span className="text-cyan-400 font-mono font-bold text-xl sm:text-2xl">&lt;/&gt;</span>
              <span className="font-extrabold text-white text-lg sm:text-xl lg:text-2xl tracking-tight font-sans">
                CodeMerce
              </span>
            </div>
            <span className="text-xs uppercase font-mono px-2.5 py-1 rounded border border-orange-500/50 text-orange-400 bg-orange-950/25 tracking-wider font-semibold">
              TECH CLUB
            </span>
          </div>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-6 lg:gap-8 text-sm font-mono tracking-wider">
            <button
              onClick={() => scrollToSection('HOME')}
              className={`transition-colors uppercase relative py-1 font-semibold ${
                activeTab === 'HOME'
                  ? 'text-orange-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              HOME
              {activeTab === 'HOME' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.9)]" />
              )}
            </button>
            <button
              onClick={() => scrollToSection('ABOUT')}
              className={`transition-colors uppercase relative py-1 font-semibold ${
                activeTab === 'ABOUT'
                  ? 'text-orange-400 font-bold'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              ABOUT
              {activeTab === 'ABOUT' && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.9)]" />
              )}
            </button>
            <span className="text-slate-500 hover:text-slate-400 cursor-not-allowed">DOMAINS</span>
            <span className="text-slate-500 hover:text-slate-400 cursor-not-allowed">ACHIEVEMENTS</span>
            <span className="text-slate-500 hover:text-slate-400 cursor-not-allowed">EVENTS</span>
            <span className="text-slate-500 hover:text-slate-400 cursor-not-allowed">TEAM</span>
            <span className="text-slate-500 hover:text-slate-400 cursor-not-allowed">CONTACT</span>
          </nav>
        </header>

        {/* 
          =======================================================
          HOME SECTION CONTENT OVERLAY (Scaled for Desktop Impact)
          =======================================================
        */}
        <div
          ref={homeOverlayRef}
          className="absolute inset-0 z-20 flex flex-col justify-between pointer-events-auto px-6 sm:px-10 md:px-12 lg:px-16 xl:px-20 pt-20 sm:pt-24 lg:pt-28 pb-6 sm:pb-8 lg:pb-10 will-change-[opacity,transform]"
          style={{ opacity: 1, transform: 'translate3d(0, 0px, 0)', visibility: 'visible' }}
        >
          {/* Main Content Column (Left quadrant: ~38-42% width, ample space before centered bunny) */}
          <div className="flex-1 flex flex-col justify-center w-full max-w-lg md:max-w-xl lg:max-w-[42vw] xl:max-w-[40vw]">
            {/* Technical Label */}
            <div className="flex items-center gap-2 sm:gap-2.5 mb-3.5 sm:mb-5 lg:mb-6 max-w-full overflow-hidden">
              <span className="w-4 sm:w-8 lg:w-10 h-[2px] bg-orange-500 shrink-0" />
              <span className="tech-label uppercase text-orange-400 font-mono truncate sm:overflow-visible">
                CODEMERCE CLUB &bull; CSBS TECHNICAL ASSOCIATION
              </span>
              <span className="w-4 sm:w-8 lg:w-10 h-[2px] bg-orange-500 shrink-0" />
            </div>

            {/* Oversized Gamified Heading */}
            <h1 className="hero-title text-white font-sans select-none mb-4 sm:mb-5 lg:mb-6">
              BUILD.
              <br />
              CREATE.
              <br />
              <span className="text-glow-orange">INNOVATE.</span>
            </h1>

            {/* Supporting Text */}
            <p className="hero-desc font-sans mb-6 sm:mb-7 lg:mb-8 max-w-md lg:max-w-lg xl:max-w-xl">
              A student-driven technical community where creativity meets code, ideas become reality, and innovation drives the future.
            </p>

            {/* Buttons & Motto */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 lg:gap-7 mb-2">
              {/* Gamified Deliberate Primary Action Button */}
              <button
                onClick={() => scrollToSection('ABOUT')}
                className="corner-bracket-btn hero-btn font-mono text-orange-400 hover:text-orange-300 transition-all flex items-center gap-3 hover:bg-orange-950/40 shadow-[0_0_25px_rgba(249,115,22,0.25)] cursor-pointer group"
              >
                <span>EXPLORE CLUB</span>
                <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400 group-hover:translate-x-1.5 transition-transform" />
              </button>

              <span className="text-xs sm:text-sm font-mono text-slate-300 tracking-wider font-semibold">
                CREATE &bull; CODE &bull; ELEVATE
              </span>
            </div>
          </div>

          {/* Bottom Bar: Social Links (Left) and Minimal Scroll Indicator (Center/Right) */}
          <div className="flex items-end justify-between w-full pt-4 border-t border-white/[0.08]">
            {/* Social Icons in Corner-Bracket Box */}
            <div className="corner-bracket-box px-5 sm:px-6 py-2.5 sm:py-3 flex items-center gap-5 sm:gap-6 text-slate-400">
              <a
                href="#instagram"
                className="hover:text-orange-400 hover:scale-110 transition-all"
                title="Instagram"
                aria-label="Instagram"
              >
                <Instagram className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              </a>
              <a
                href="#linkedin"
                className="hover:text-orange-400 hover:scale-110 transition-all"
                title="LinkedIn"
                aria-label="LinkedIn"
              >
                <Linkedin className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              </a>
              <a
                href="#github"
                className="hover:text-orange-400 hover:scale-110 transition-all"
                title="GitHub"
                aria-label="GitHub"
              >
                <Github className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              </a>
              <a
                href="#twitter"
                className="hover:text-orange-400 hover:scale-110 transition-all"
                title="Twitter"
                aria-label="Twitter"
              >
                <Twitter className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
              </a>
            </div>

            {/* Minimal Text Scroll Indicator */}
            <div className="hidden sm:flex items-center gap-2 text-xs sm:text-sm font-mono text-slate-400 tracking-wider animate-pulse font-medium">
              <span>SCROLL TO EXPLORE</span>
              <ChevronDown className="w-4 h-4 text-orange-400" />
            </div>
          </div>
        </div>

        {/* 
          =======================================================
          ABOUT SECTION CONTENT OVERLAY (Scaled for Desktop Impact)
          (Reveals as bunny moves right and points left)
          =======================================================
        */}
        <div
          ref={aboutOverlayRef}
          className="absolute inset-0 z-20 flex flex-col justify-between pointer-events-none px-6 sm:px-10 md:px-12 lg:px-16 xl:px-20 pt-20 sm:pt-24 lg:pt-28 pb-6 sm:pb-8 lg:pb-10 will-change-[opacity,transform]"
          style={{ opacity: 0, transform: 'translate3d(0, 24px, 0)', visibility: 'hidden' }}
        >
          {/* Main Content Column (Left quadrant, identically centered vertically with Home) */}
          <div className="flex-1 flex flex-col justify-center w-full max-w-lg md:max-w-xl lg:max-w-[42vw] xl:max-w-[40vw]">
            {/* Section Identifier */}
            <div className="flex items-center gap-2 sm:gap-2.5 mb-3.5 sm:mb-5 lg:mb-6">
              <span className="w-5 sm:w-8 lg:w-10 h-[2px] bg-orange-500 shrink-0" />
              <span className="tech-label uppercase text-orange-400 font-mono">
                01 / ABOUT CODEMERCE
              </span>
              <span className="w-5 sm:w-8 lg:w-10 h-[2px] bg-orange-500 shrink-0" />
            </div>

            {/* Main Heading */}
            <h2 className="about-title text-white font-sans mb-4 sm:mb-5 lg:mb-6">
              MORE THAN
              <br />
              <span className="text-glow-orange">JUST CODE.</span>
            </h2>

            {/* Official Description Paragraphs */}
            <div className="space-y-3 sm:space-y-4 about-desc font-sans mb-6 sm:mb-7 lg:mb-8 max-w-md lg:max-w-lg xl:max-w-xl">
              <p>
                The <strong className="text-white font-semibold">CODEMERCE-CSBS Technical Association</strong> is a student-driven technical community focused on building practical skills, innovation, and industry readiness. Guided by the motto <em className="text-orange-400 font-mono not-italic font-semibold">Create &bull; Code &bull; Elevate</em>, we organize innovative events, workshops, and hands-on activities that bridge academics with real-world applications.
              </p>
              <p className="text-slate-400">
                CODEMERCE encourages problem-solving, design thinking, teamwork, and leadership while empowering students to explore emerging technologies and business systems.
              </p>
            </div>

            {/* Technical Value Statements (Gamified Pills) */}
            <div className="flex flex-wrap gap-2 sm:gap-3 lg:gap-3.5">
              {[
                { id: '01', label: 'Practical Skills' },
                { id: '02', label: 'Innovation' },
                { id: '03', label: 'Industry Readiness' },
                { id: '04', label: 'Problem Solving' },
                { id: '05', label: 'Teamwork & Leadership' },
              ].map((item) => (
                <div
                  key={item.id}
                  className="corner-bracket-box value-pill flex items-center gap-2 sm:gap-2.5 font-mono text-slate-200 tracking-wide font-medium"
                >
                  <span className="text-orange-400 font-bold">[{item.id}]</span>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Invisible bottom spacer matching Home bottom-bar height for vertical centering harmony */}
          <div className="w-full pt-4 border-t border-transparent invisible select-none pointer-events-none" aria-hidden="true">
            <div className="py-2.5 sm:py-3">&nbsp;</div>
          </div>
        </div>

        {/* Accessible scrub control for prefers-reduced-motion */}
        {prefersReducedMotion && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 px-5 py-3 rounded-2xl bg-slate-900/90 border border-slate-700/60 shadow-2xl flex flex-col items-center gap-1.5 w-72 max-w-[90vw]">
            <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider">
              Accessible Frame Control
            </span>
            <input
              type="range"
              min={0}
              max={TOTAL_FRAME_COUNT - 1}
              value={manualFrameIndex}
              onChange={handleReducedMotionScrub}
              className="w-full accent-cyan-400 cursor-pointer"
              aria-label="Frame Scrub Slider"
            />
            <span className="text-[10px] font-mono text-slate-400">
              Frame #{manualFrameIndex + 1} / {TOTAL_FRAME_COUNT}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
