import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { DetailPanel } from '../DetailPanel/DetailPanel';
import { CoachPanel } from './CoachPanel';
import { invokeAddCommand, invokeSetEntity } from '../../utils/modalCallbacks';
import { COACH_ENABLED } from '../../utils/featureFlags';

const WIDTH_KEY = 'es-right-column-width';
const LEGACY_WIDTH_KEY = 'es-detail-panel-width';
const RATIO_KEY = 'es-coach-panel-ratio';
const TAB_KEY = 'es-right-column-active-tab';

const WIDTH_DEFAULT = 480;
const WIDTH_MIN = 320;
const WIDTH_MAX = 720;
const RATIO_DEFAULT = 0.4;
const RATIO_MIN = 0.2;
const RATIO_MAX = 0.8;
const SMALL_SCREEN_BP = 1280;
const TAB_HEADER_H = 32;

const PANEL_BG = '#1e293b';
const BORDER_COLOR = 'rgba(255, 255, 255, 0.08)';
const TEXT_DIM = 'rgba(255, 255, 255, 0.6)';
const TEXT_MAIN = 'rgba(255, 255, 255, 0.92)';
const ACCENT = '#60a5fa';

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function readWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_KEY) ?? localStorage.getItem(LEGACY_WIDTH_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    if (Number.isFinite(n)) return clamp(n, WIDTH_MIN, WIDTH_MAX);
  } catch {
    // ignore
  }
  return WIDTH_DEFAULT;
}

function readRatio(): number {
  try {
    const raw = localStorage.getItem(RATIO_KEY);
    const n = raw ? parseFloat(raw) : NaN;
    if (Number.isFinite(n)) return clamp(n, RATIO_MIN, RATIO_MAX);
  } catch {
    // ignore
  }
  return RATIO_DEFAULT;
}

function readTab(): 'detail' | 'coach' {
  try {
    const raw = localStorage.getItem(TAB_KEY);
    return raw === 'coach' ? 'coach' : 'detail';
  } catch {
    return 'detail';
  }
}

interface VerticalResizeBarProps {
  onResize: (delta: number) => void;
}

const VerticalResizeBar: React.FC<VerticalResizeBarProps> = ({ onResize }) => {
  const [active, setActive] = useState(false);
  const lastX = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    lastX.current = e.clientX;
    setActive(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    const delta = e.clientX - lastX.current;
    lastX.current = e.clientX;
    onResize(delta);
  };
  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    setActive(false);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={() => setActive(false)}
      style={{
        position: 'absolute',
        left: -3,
        top: 0,
        bottom: 0,
        width: 6,
        cursor: 'ew-resize',
        zIndex: 110,
        background: active ? 'rgba(96, 165, 250, 0.3)' : 'transparent',
      }}
    />
  );
};

interface HorizontalResizeBarProps {
  onResize: (delta: number) => void;
}

const HorizontalResizeBar: React.FC<HorizontalResizeBarProps> = ({ onResize }) => {
  const [active, setActive] = useState(false);
  const lastY = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    lastY.current = e.clientY;
    setActive(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    const delta = e.clientY - lastY.current;
    lastY.current = e.clientY;
    onResize(delta);
  };
  const release = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!active) return;
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId);
    setActive(false);
  };

  return (
    <div
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={() => setActive(false)}
      style={{
        height: 5,
        cursor: 'ns-resize',
        background: active ? 'rgba(96, 165, 250, 0.3)' : BORDER_COLOR,
        flexShrink: 0,
      }}
    />
  );
};

export const RightColumn: React.FC = () => {
  const selectedElementId = useUIStore((s) => s.selectedElementId);
  const selectedElementType = useUIStore((s) => s.selectedElementType);
  const isOpen = selectedElementId !== null && selectedElementType !== null;

  const [width, setWidth] = useState(readWidth);
  const [ratio, setRatio] = useState(readRatio);
  const [innerHeight, setInnerHeight] = useState(typeof window !== 'undefined' ? window.innerHeight : 800);
  const [smallScreen, setSmallScreen] = useState(typeof window !== 'undefined' ? window.innerWidth < SMALL_SCREEN_BP : false);
  const [activeTab, setActiveTabState] = useState<'detail' | 'coach'>(readTab);

  const tabContainerRef = useRef<HTMLDivElement | null>(null);

  const setActiveTab = useCallback((tab: 'detail' | 'coach') => {
    setActiveTabState(tab);
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      // ignore
    }
    // Focus restore：tab 切換後把焦點移回容器（讓鍵盤 user 不會掉到 body）
    requestAnimationFrame(() => {
      tabContainerRef.current?.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // ignore
    }
  }, [width]);

  useEffect(() => {
    try {
      localStorage.setItem(RATIO_KEY, String(ratio));
    } catch {
      // ignore
    }
  }, [ratio]);

  useEffect(() => {
    const onResize = () => {
      setInnerHeight(window.innerHeight);
      setSmallScreen(window.innerWidth < SMALL_SCREEN_BP);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Auto-switch to detail tab when something gets selected on small screen
  const prevIsOpen = useRef(isOpen);
  useEffect(() => {
    if (smallScreen && isOpen && !prevIsOpen.current) {
      setActiveTab('detail');
    }
    prevIsOpen.current = isOpen;
  }, [isOpen, smallScreen, setActiveTab]);

  const onWidthDelta = useCallback((delta: number) => {
    setWidth((w) => clamp(w - delta, WIDTH_MIN, WIDTH_MAX));
  }, []);
  const onRatioDelta = useCallback((delta: number) => {
    const totalH = innerHeight;
    setRatio((r) => clamp(r - delta / totalH, RATIO_MIN, RATIO_MAX));
  }, [innerHeight]);

  if (smallScreen) {
    const contentH = innerHeight - TAB_HEADER_H;
    const detailH = activeTab === 'detail' ? contentH : 0;
    const coachH = activeTab === 'coach' ? contentH : 0;
    return (
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width,
          background: PANEL_BG,
          borderLeft: `1px solid ${BORDER_COLOR}`,
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <VerticalResizeBar onResize={onWidthDelta} />
        {COACH_ENABLED && (
          <div
            style={{
              height: TAB_HEADER_H,
              display: 'flex',
              borderBottom: `1px solid ${BORDER_COLOR}`,
              flexShrink: 0,
            }}
          >
            <TabButton active={activeTab === 'detail'} onClick={() => setActiveTab('detail')}>
              Detail
            </TabButton>
            <TabButton active={activeTab === 'coach'} onClick={() => setActiveTab('coach')}>
              Coach
            </TabButton>
          </div>
        )}
        <div ref={tabContainerRef} tabIndex={-1} style={{ flex: 1, position: 'relative', overflow: 'hidden', outline: 'none' }}>
          <DetailPanel
            containerHeight={detailH}
            containerWidth={width}
            hidden={COACH_ENABLED ? activeTab !== 'detail' : false}
            onAddCommand={invokeAddCommand}
            onSetEntity={invokeSetEntity}
          />
          {COACH_ENABLED && (
            <div style={{ display: activeTab === 'coach' ? 'block' : 'none', height: '100%' }}>
              <CoachPanel height={coachH} width={width} />
            </div>
          )}
        </div>
      </div>
    );
  }

  // Wide-screen: stacked layout, DetailPanel always-mounted, height 切換。
  // ResizeBar 佔 5px，總高度需扣除避免溢出產生意外捲軸。
  // Coach disabled (feature flag) → DetailPanel 吃整個 column 高度，無 ResizeBar / CoachPanel。
  const RESIZE_BAR_H = 5;
  const wideUsableH = COACH_ENABLED && isOpen ? innerHeight - RESIZE_BAR_H : innerHeight;
  const detailH = COACH_ENABLED
    ? (isOpen ? Math.round(wideUsableH * (1 - ratio)) : 0)
    : innerHeight;
  const coachH = COACH_ENABLED && isOpen ? wideUsableH - detailH : innerHeight;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        width,
        background: PANEL_BG,
        borderLeft: `1px solid ${BORDER_COLOR}`,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <VerticalResizeBar onResize={onWidthDelta} />
      <DetailPanel
        containerHeight={detailH}
        containerWidth={width}
        onAddCommand={invokeAddCommand}
        onSetEntity={invokeSetEntity}
      />
      {COACH_ENABLED && isOpen && <HorizontalResizeBar onResize={onRatioDelta} />}
      {COACH_ENABLED && <CoachPanel height={coachH} width={width} />}
    </div>
  );
};

const TabButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    style={{
      flex: 1,
      background: active ? 'rgba(96, 165, 250, 0.12)' : 'transparent',
      border: 'none',
      borderBottom: active ? `2px solid ${ACCENT}` : '2px solid transparent',
      color: active ? TEXT_MAIN : TEXT_DIM,
      fontSize: 12,
      fontWeight: active ? 600 : 400,
      cursor: 'pointer',
      padding: 0,
    }}
  >
    {children}
  </button>
);
