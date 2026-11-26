import { Feather, Pause, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import type { HudSnapshot, ItemId } from '../game/types';
import { ITEM_METADATA } from '../game/rules';
import { NekameLogo } from './NekameLogo';

interface GameHudProps {
  hud: HudSnapshot;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onInspectSlot: (idx: number) => void;
  onDirection: (dir: 'left' | 'right' | 'up' | 'down', active: boolean) => void;
  onJump: (pressed: boolean) => void;
  onPunch: () => void;
  onKick: () => void;
}

function ItemSvg({ id }: { id: ItemId }) {
  if (id === 'key') {
    return (
      <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" aria-hidden="true">
        <circle cx="10.5" cy="11.5" r="5.5" fill="#9ca3af" stroke="#181d16" strokeWidth="2" />
        <circle cx="10.5" cy="11.5" r="2" fill="#2a3127" />
        <path d="M14.5 15.5L25 26M21 22L24.5 18.5M23.5 24.5L27 21" stroke="#cbd5e1" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className="w-7 h-7" fill="none" aria-hidden="true">
      <path
        d="M16 4C11.6 4 8 7.5 8 11.8C8 14.5 9.4 16.8 11.4 18.2C12.2 18.8 12.6 19.7 12.7 20.7H19.3C19.4 19.7 19.8 18.8 20.6 18.2C22.6 16.8 24 14.5 24 11.8C24 7.5 20.4 4 16 4Z"
        fill="#fef08a"
        stroke="#181d16"
        strokeWidth="2"
      />
      <rect x="12.5" y="21" width="7" height="5" rx="1.5" fill="#94a3b8" stroke="#181d16" strokeWidth="1.5" />
      <path d="M14 13.5L16 10.5L18 13.5" stroke="#ca8a04" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function GameHud({
  hud,
  onToggleMute,
  onPause,
  onRestart,
  onInspectSlot,
  onDirection,
  onJump,
  onPunch,
  onKick,
}: GameHudProps) {
  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = Math.floor(sec % 60);
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-3 sm:p-5">
      {/* Top Perimeter Cluster */}
      <div className="flex items-start justify-between gap-3">
        {/* Top-Left: Backpack + 2-Slot Inventory + Step Counter */}
        <div className="flex items-center gap-3 pointer-events-auto flex-wrap">
          <div
            className="flex items-center gap-2 bg-[#232920]/92 border-2 border-[#6a634f] rounded-xl px-2.5 py-2 shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
            aria-label={`Túi đồ ${hud.inventory.length}/2 ô`}
          >
            {/* Backpack SVG icon */}
            <svg viewBox="0 0 36 36" className="w-8 h-8 shrink-0" fill="none" aria-hidden="true">
              <path d="M13 8C13 5.5 23 5.5 23 8" stroke="#181d16" strokeWidth="3" strokeLinecap="round" />
              <rect x="7" y="9" width="22" height="22" rx="6" fill="#5e5540" stroke="#181d16" strokeWidth="2.2" />
              <path d="M7 16H29" stroke="#181d16" strokeWidth="2" />
              <rect x="11" y="20" width="14" height="8" rx="2.5" fill="#463f30" stroke="#181d16" strokeWidth="1.8" />
              <rect x="16" y="14" width="4" height="4" rx="1" fill="#c9b478" stroke="#181d16" strokeWidth="1.2" />
            </svg>

            {/* 2 Inventory Slots */}
            <div className="flex items-center gap-1.5">
              {[0, 1].map((slotIdx) => {
                const item = hud.inventory[slotIdx];
                return (
                  <button
                    key={slotIdx}
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onInspectSlot(slotIdx);
                    }}
                    aria-label={item ? `Ô ${slotIdx + 1}: ${ITEM_METADATA[item].label}` : `Ô túi đồ ${slotIdx + 1} trống`}
                    className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-colors ${
                      item
                        ? 'bg-[#353d30] border-[#c9b478] hover:bg-[#424d3b]'
                        : 'bg-[#1a1f18] border-[#4b5144]'
                    }`}
                  >
                    {item ? (
                      <ItemSvg id={item} />
                    ) : (
                      <span className="text-[10px] text-[#5c6354] font-mono-tabular">{slotIdx + 1}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step & Timer Plaque */}
          <div className="flex items-center gap-4 bg-[#232920]/90 border-2 border-[#5b6251] rounded-xl px-3.5 py-2 shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-[#a5af97] font-semibold">Bước chân</span>
              <span className="font-mono-tabular text-base sm:text-lg font-bold text-[#eef1e6] leading-tight">
                {hud.steps} / {hud.maxSteps}
              </span>
            </div>
            <div className="w-px h-7 bg-[#4c5444]" aria-hidden="true" />
            <div className="hidden sm:flex flex-col">
              <span className="text-[10px] uppercase tracking-wider text-[#a5af97] font-semibold">Thời gian</span>
              <span className="font-mono-tabular text-base sm:text-lg font-bold text-[#e5c158] leading-tight">
                {formatTime(hud.elapsedSec)}
              </span>
            </div>
          </div>

          {/* Active Wing Buff Countdown (5s after defeating a Pterodactyl) */}
          {hud.wingBuffSec > 0 && (
            <div
              role="status"
              className="flex items-center gap-2 bg-[#3c3419]/92 border-2 border-[#e5c158] rounded-xl px-3 py-2 shadow-[0_4px_12px_rgba(0,0,0,0.45)]"
            >
              <Feather className="w-4 h-4 text-[#fde047] shrink-0" aria-hidden="true" />
              <div className="flex flex-col">
                <span className="text-[10px] uppercase tracking-wider text-[#fde68a] font-semibold">Cánh bay</span>
                <span className="font-mono-tabular text-sm font-bold text-[#fef08a] leading-tight">
                  {hud.wingBuffSec.toFixed(1)}s
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top-Right: Publisher Monogram & Utility Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="hidden md:flex items-center bg-[#232920]/88 border-2 border-[#5b6251] rounded-xl px-2.5 py-1.5 shadow">
            <NekameLogo size="sm" showPublisherText={false} />
          </div>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={hud.muted ? 'Bật âm thanh [M]' : 'Tắt âm thanh [M]'}
            title="Âm thanh [M]"
            className="w-10 h-10 rounded-xl bg-[#232920]/92 border-2 border-[#5b6251] text-[#e7eadf] hover:border-[#e5c158] hover:text-[#e5c158] flex items-center justify-center transition-colors"
          >
            {hud.muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            aria-label="Chơi lại [R]"
            title="Chơi lại [R]"
            className="w-10 h-10 rounded-xl bg-[#232920]/92 border-2 border-[#5b6251] text-[#e7eadf] hover:border-[#e5c158] hover:text-[#e5c158] flex items-center justify-center transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            aria-label="Tạm dừng [P]"
            title="Tạm dừng [P / Esc]"
            className="w-10 h-10 rounded-xl bg-[#232920]/92 border-2 border-[#5b6251] text-[#e7eadf] hover:border-[#e5c158] hover:text-[#e5c158] flex items-center justify-center transition-colors"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Controls + Contextual World Hint */}
      <div className="flex items-end justify-between gap-2">
        {/* Bottom-Left: Tactile Stone/Bronze D-Pad */}
        <div
          className="relative w-32 h-32 sm:w-36 sm:h-36 pointer-events-auto shrink-0"
          role="group"
          aria-label="Phím điều hướng"
        >
          {/* Up */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Đi lên"
            onPointerDown={() => onDirection('up', true)}
            onPointerUp={() => onDirection('up', false)}
            onPointerLeave={() => onDirection('up', false)}
            onPointerCancel={() => onDirection('up', false)}
            className="absolute top-0 left-1/3 w-1/3 h-[38%] rounded-t-xl bg-[#544d3e]/90 active:bg-[#756b56] border-2 border-[#231f18] shadow-inner flex items-center justify-center text-[#d9d2bf]"
          >
            <span className="text-xs font-bold">▲</span>
          </button>
          {/* Down */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Đi xuống"
            onPointerDown={() => onDirection('down', true)}
            onPointerUp={() => onDirection('down', false)}
            onPointerLeave={() => onDirection('down', false)}
            onPointerCancel={() => onDirection('down', false)}
            className="absolute bottom-0 left-1/3 w-1/3 h-[38%] rounded-b-xl bg-[#544d3e]/90 active:bg-[#756b56] border-2 border-[#231f18] shadow-inner flex items-center justify-center text-[#d9d2bf]"
          >
            <span className="text-xs font-bold">▼</span>
          </button>
          {/* Left */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Đi sang trái"
            onPointerDown={() => onDirection('left', true)}
            onPointerUp={() => onDirection('left', false)}
            onPointerLeave={() => onDirection('left', false)}
            onPointerCancel={() => onDirection('left', false)}
            className="absolute left-0 top-1/3 w-[38%] h-1/3 rounded-l-xl bg-[#544d3e]/90 active:bg-[#756b56] border-2 border-[#231f18] shadow-inner flex items-center justify-center text-[#d9d2bf]"
          >
            <span className="text-xs font-bold">◀</span>
          </button>
          {/* Right */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Đi sang phải"
            onPointerDown={() => onDirection('right', true)}
            onPointerUp={() => onDirection('right', false)}
            onPointerLeave={() => onDirection('right', false)}
            onPointerCancel={() => onDirection('right', false)}
            className="absolute right-0 top-1/3 w-[38%] h-1/3 rounded-r-xl bg-[#544d3e]/90 active:bg-[#756b56] border-2 border-[#231f18] shadow-inner flex items-center justify-center text-[#d9d2bf]"
          >
            <span className="text-xs font-bold">▶</span>
          </button>
          {/* Center pivot */}
          <div className="absolute left-1/3 top-1/3 w-1/3 h-1/3 bg-[#464033] border border-[#231f18] pointer-events-none" />
        </div>

        {/* Center Contextual Hint Line */}
        <div className="hidden sm:flex flex-col items-center mb-2">
          {hud.hintPrompt && (
            <div className="bg-[#1b2019]/90 border border-[#c9b478]/50 text-[#f3eccd] text-xs md:text-sm font-medium px-4 py-2 rounded-xl shadow-lg whitespace-nowrap">
              {hud.hintPrompt}
            </div>
          )}
        </div>

        {/* Bottom-Right: Tactile Jump, Punch, Kick / Tail Whip Buttons */}
        <div className="relative w-44 h-36 sm:w-48 sm:h-40 pointer-events-auto shrink-0">
          {/* Jump */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Nhảy (Space)"
            onPointerDown={() => onJump(true)}
            onPointerUp={() => onJump(false)}
            onPointerLeave={() => onJump(false)}
            onPointerCancel={() => onJump(false)}
            className="absolute right-1 top-0 w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full bg-[#4f483a]/92 active:scale-95 border-2 border-[#8c7e62] shadow-[0_4px_10px_rgba(0,0,0,0.45)] flex flex-col items-center justify-center text-[#eee7d1]"
          >
            <span className="text-sm font-bold leading-none">▲</span>
            <span className="text-[11px] font-bold mt-0.5">Nhảy</span>
          </button>

          {/* Punch */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Đánh (J)"
            onClick={(e) => {
              e.currentTarget.blur();
              onPunch();
            }}
            className="absolute left-2 bottom-1 w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full bg-[#4f483a]/92 active:scale-95 border-2 border-[#8c7e62] shadow-[0_4px_10px_rgba(0,0,0,0.45)] flex flex-col items-center justify-center text-[#eee7d1]"
          >
            <span className="text-xs font-extrabold tracking-tight">J</span>
            <span className="text-[11px] font-bold">Đánh</span>
          </button>

          {/* Kick / Tail Whip */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Đá / Quất đuôi (K)"
            onClick={(e) => {
              e.currentTarget.blur();
              onKick();
            }}
            className={`absolute right-1 bottom-1 w-16 h-16 sm:w-[70px] sm:h-[70px] rounded-full active:scale-95 border-2 shadow-[0_4px_10px_rgba(0,0,0,0.45)] flex flex-col items-center justify-center transition-colors ${
              hud.comboWindowActive
                ? 'bg-[#6e5624] border-[#fde047] text-[#fef08a]'
                : 'bg-[#4f483a]/92 border-[#8c7e62] text-[#eee7d1]'
            }`}
          >
            <span className="text-xs font-extrabold tracking-tight">K×2</span>
            <span className="text-[10px] font-bold leading-tight">
              {hud.comboWindowActive ? 'Quất đuôi!' : 'Đá / Đuôi'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
