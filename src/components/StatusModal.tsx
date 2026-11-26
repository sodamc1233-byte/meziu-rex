import { useState } from 'react';
import type { HudSnapshot } from '../game/types';
import { NekameLogo } from './NekameLogo';
import { AppDownloadModal } from './PWAInstallButton';

interface StatusModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onRespawn: () => void;
  onTitle: () => void;
}

export function StatusModal({ hud, onResume, onRestart, onRespawn, onTitle }: StatusModalProps) {
  const [downloadOpen, setDownloadOpen] = useState(false);

  if (hud.state === 'title' || hud.state === 'playing') return null;

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const rem = (sec % 60).toFixed(1).padStart(4, '0');
    return `${String(mins).padStart(2, '0')}:${rem}`;
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#0f140e]/75">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-2xl bg-[#222820] border-2 border-[#7e755c] p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.65)] text-[#eef1e6]"
      >
        <div className="flex items-center justify-between mb-4">
          <NekameLogo size="sm" showPublisherText />
          <span className="font-mono-tabular text-xs font-semibold text-[#a5af97]">
            LEVEL 1
          </span>
        </div>

        {hud.state === 'paused' && (
          <>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#f3eccd]">
              Tạm dừng trò chơi
            </h2>
            <p className="mt-1.5 text-sm text-[#b9c2ab]">
              Meziu Rex đang nghỉ chân giữa tàn tích.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResume}
                className="w-full py-3 px-5 rounded-xl bg-[#e5c158] hover:bg-[#f0d06e] text-[#181d16] font-display font-extrabold text-base transition-colors"
              >
                Tiếp tục chơi
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="w-full py-2.5 px-5 rounded-xl bg-[#31382d] hover:bg-[#3d4638] border border-[#68715b] text-[#eef1e6] font-semibold text-sm transition-colors"
              >
                Chơi lại Level 1
              </button>
              <button
                type="button"
                onClick={() => setDownloadOpen(true)}
                className="w-full py-2.5 px-5 rounded-xl bg-[#272e24] hover:bg-[#333c2f] border border-[#68715b] text-[#e5c158] font-semibold text-sm text-center transition-colors"
              >
                Tải Game / Cài App về ĐT &amp; PC
              </button>
              <button
                type="button"
                onClick={onTitle}
                className="w-full py-2.5 px-5 rounded-xl bg-transparent hover:bg-[#2c3329] text-[#b4bda8] font-semibold text-sm transition-colors"
              >
                Về màn hình chính
              </button>
            </div>
          </>
        )}

        {hud.state === 'gameover' && (
          <>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#fca5a5]">
              {hud.deathReason ?? 'Rơi xuống vực!'}
            </h2>
            <p className="mt-1.5 text-sm text-[#c7cfbb]">
              {hud.deathReason?.includes('khủng long bay')
                ? 'Meziu Rex đã bị khủng long bay cắn trúng 3 lần!'
                : 'Meziu Rex đã trượt chân khỏi ván cầu gỗ.'}{' '}
              Đang hồi sinh tại vỏ trứng sau{' '}
              <span className="font-mono-tabular font-bold text-[#e5c158]">
                {Math.ceil(hud.respawnCountdown)}s
              </span>
              ...
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-[#1a2018] border border-[#4a5241] p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9ba58e]">Bước đã đi</div>
                <div className="font-mono-tabular text-xl font-bold text-[#eef1e6] mt-0.5">
                  {hud.steps} / {hud.maxSteps}
                </div>
              </div>
              <div className="rounded-xl bg-[#1a2018] border border-[#4a5241] p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9ba58e]">Túi đồ</div>
                <div className="font-mono-tabular text-xl font-bold text-[#e5c158] mt-0.5">
                  {hud.inventory.length} / 2
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={onRespawn}
                className="flex-1 py-3 px-5 rounded-xl bg-[#e5c158] hover:bg-[#f0d06e] text-[#181d16] font-display font-extrabold text-base transition-colors"
              >
                Hồi sinh ngay
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="py-3 px-4 rounded-xl bg-[#31382d] hover:bg-[#3d4638] border border-[#68715b] text-[#eef1e6] font-semibold text-sm transition-colors"
              >
                Chơi lại từ đầu
              </button>
            </div>
          </>
        )}

        {hud.state === 'victory' && (
          <>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-[#e5c158]">
              Hoàn thành Test Level 1
            </h2>
            <p className="mt-1.5 text-sm text-[#c9d1be]">
              Cánh cổng cổ đại đã mở! Sẵn sàng sang Level 2.
            </p>

            <div className="mt-5 grid grid-cols-3 gap-2.5">
              <div className="rounded-xl bg-[#1a2018] border border-[#4a5241] p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9ba58e]">Thời gian</div>
                <div className="font-mono-tabular text-lg font-bold text-[#eef1e6] mt-0.5">
                  {formatTime(hud.elapsedSec)}
                </div>
              </div>
              <div className="rounded-xl bg-[#1a2018] border border-[#4a5241] p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9ba58e]">Bước chân</div>
                <div className="font-mono-tabular text-lg font-bold text-[#eef1e6] mt-0.5">
                  {hud.steps} / {hud.maxSteps}
                </div>
              </div>
              <div className="rounded-xl bg-[#1a2018] border border-[#4a5241] p-3">
                <div className="text-[11px] uppercase tracking-wider text-[#9ba58e]">Kỷ lục</div>
                <div className="font-mono-tabular text-lg font-bold text-[#e5c158] mt-0.5">
                  {hud.bestTimeSec !== null ? formatTime(hud.bestTimeSec) : formatTime(hud.elapsedSec)}
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                data-start="true"
                onClick={onRestart}
                className="flex-1 py-3 px-5 rounded-xl bg-[#e5c158] hover:bg-[#f0d06e] text-[#181d16] font-display font-extrabold text-base transition-colors"
              >
                Chơi lại Level 1
              </button>
              <button
                type="button"
                onClick={onTitle}
                className="py-3 px-4 rounded-xl bg-[#31382d] hover:bg-[#3d4638] border border-[#68715b] text-[#eef1e6] font-semibold text-sm transition-colors"
              >
                Màn hình chính
              </button>
            </div>
          </>
        )}
      </div>

      <AppDownloadModal open={downloadOpen} onClose={() => setDownloadOpen(false)} />
    </div>
  );
}
