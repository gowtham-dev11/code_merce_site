export interface FrameMeta {
  globalIndex: number; // 0 to 99
  clip: 1 | 2;
  localIndex: number;  // 1 to 60 for clip 1, 1 to 40 for clip 2
  filename: string;
  url: string;
  phaseLabel: string;
}

export const CLIP_1_FRAME_COUNT = 60;
export const CLIP_2_FRAME_COUNT = 40;
export const TOTAL_FRAME_COUNT = CLIP_1_FRAME_COUNT + CLIP_2_FRAME_COUNT; // 100

function pad3(num: number): string {
  return num.toString().padStart(3, '0');
}

// Generate the Clip 1 frames (001 to 060)
export const CLIP_1_FRAMES: FrameMeta[] = Array.from({ length: CLIP_1_FRAME_COUNT }, (_, i) => {
  const localIndex = i + 1;
  const filename = `ezgif-frame-${pad3(localIndex)}.jpg`;
  return {
    globalIndex: i,
    clip: 1,
    localIndex,
    filename,
    url: `/bunny-frames/clip1/${filename}`,
    phaseLabel: 'Walking Right',
  };
});

// Generate the Clip 2 frames (001 to 040)
export const CLIP_2_FRAMES: FrameMeta[] = Array.from({ length: CLIP_2_FRAME_COUNT }, (_, i) => {
  const localIndex = i + 1;
  const filename = `ezgif-frame-${pad3(localIndex)}.jpg`;
  return {
    globalIndex: CLIP_1_FRAME_COUNT + i,
    clip: 2,
    localIndex,
    filename,
    url: `/bunny-frames/clip2/${filename}`,
    phaseLabel: 'Turning & Pointing Left',
  };
});

// Combined continuous 100-frame sequence
export const ALL_FRAMES: FrameMeta[] = [...CLIP_1_FRAMES, ...CLIP_2_FRAMES];

export const ASPECT_RATIO = 16 / 9;
export const ORIGINAL_WIDTH = 1920;
export const ORIGINAL_HEIGHT = 1080;
