import { Volume2, VolumeX } from 'lucide-react';
import { NekameLogo } from './NekameLogo';
import { PWAInstallButton } from './PWAInstallButton';

interface TitleOverlayProps {
  onStart: () => void;
  muted: boolean;
  onToggleMute: () => void;
  downloadModalOpen?: boolean;
  onDownloadModalChange?: (open: boolean) => void;
  autoDownloaded?: boolean;
}

export function TitleOverlay({
  onStart,
  muted,
  onToggleMute,
  downloadModalOpen,
  onDownloadModalChange,
  autoDownloaded,
}: TitleOverlayProps) {
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-10 pointer-events-none">
      {/* Top Row: Publisher Crest (left) & Sound Toggle (right) */}
      <div className="flex items-start justify-between gap-3">
        <div className="pointer-events-auto rounded-xl bg-[#1a2018]/88 border border-[#6a735c]/45 px-3.5 py-2 shadow-lg">
          <NekameLogo size="md" showPublisherText />
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onToggleMute();
          }}
          aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          className="pointer-events-auto flex items-center justify-center w-11 h-11 rounded-xl bg-[#1a2018]/88 border border-[#6a735c]/50 text-[#e7eadf] hover:border-[#e5c158] hover:text-[#e5c158] transition-colors focus-visible:outline-2 focus-visible:outline-[#e5c158]"
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Main Focal Title Lockup over calm foggy sky negative space */}
      <div className="flex flex-col items-start max-w-xl my-auto pl-1 md:pl-6">
        {/* Bespoke inline SVG Title Lockup */}
        <svg
          viewBox="0 0 540 155"
          className="w-[300px] sm:w-[420px] md:w-[500px] h-auto drop-shadow-[0_6px_14px_rgba(10,14,10,0.75)]"
          role="img"
          aria-label="MEZIU REX"
        >
          {/* Carved stone banner plaque */}
          <path
            d="M18 18 L522 10 L508 118 L28 128 Z"
            fill="#232920"
            fillOpacity="0.9"
            stroke="#737d63"
            strokeWidth="3.5"
          />
          <path
            d="M28 28 L510 21 L499 109 L36 118 Z"
            fill="none"
            stroke="#c9b478"
            strokeOpacity="0.45"
            strokeWidth="1.5"
          />
          {/* Title Lettering with crisp outer stroke */}
          <text
            x="270"
            y="88"
            textAnchor="middle"
            fill="#e9edd8"
            stroke="#151913"
            strokeWidth="10"
            paintOrder="stroke fill"
            style={{
              fontFamily: '"Bricolage Grotesque", system-ui, sans-serif',
              fontSize: '74px',
              fontWeight: 800,
              letterSpacing: '0.04em',
            }}
          >
            MEZIU REX
          </text>
          {/* Chapter Subtitle carved onto lower edge */}
          <rect x="105" y="108" width="330" height="30" rx="5" fill="#181d16" stroke="#c9b478" strokeWidth="1.8" />
          <text
            x="270"
            y="128"
            textAnchor="middle"
            fill="#e5c158"
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '14px',
              fontWeight: 700,
              letterSpacing: '0.12em',
            }}
          >
            LEVEL 1 · KỶ NGUYÊN SỤP ĐỔ
          </text>
        </svg>

        <div className="mt-6 flex flex-wrap items-center gap-3.5 pointer-events-auto">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="px-7 py-3.5 rounded-xl bg-[#e5c158] hover:bg-[#f0d06e] active:scale-[0.98] text-[#181d16] font-display font-extrabold text-lg tracking-wide shadow-[0_6px_0_#9b7d2b,0_12px_24px_rgba(0,0,0,0.45)] transition-transform whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
          >
            Bắt đầu chơi
          </button>

          <PWAInstallButton
            externalOpen={downloadModalOpen}
            onExternalOpenChange={onDownloadModalChange}
            autoDownloaded={autoDownloaded}
            onPlayNow={onStart}
          />
        </div>
      </div>

      {/* Single flat control hint line in bottom safe margin */}
      <div className="flex items-center justify-center">
        <p className="text-xs sm:text-sm text-[#e7eadf]/90 font-medium tracking-wide bg-[#181d16]/82 px-4 py-1.5 rounded-lg border border-[#5f6b55]/35 shadow">
          WASD / Mũi tên Di chuyển · Space Nhảy · J Đánh · K×2 Quất đuôi · Esc Tạm dừng
        </p>
      </div>
    </div>
  );
}
