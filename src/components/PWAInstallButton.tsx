import { Check, CheckCircle2, Copy, Download, ExternalLink, FileDown, Play, Share2, Smartphone, X } from 'lucide-react';
import { useState } from 'react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';
import { MeziuChompBadge } from './NekameLogo';

function copyTextFallback(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    return navigator.clipboard
      .writeText(text)
      .then(() => true)
      .catch(() => fallbackExecCopy(text));
  }
  return Promise.resolve(fallbackExecCopy(text));
}

function fallbackExecCopy(text: string): boolean {
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function AppDownloadModal({
  open,
  onClose,
  autoDownloaded = false,
  onPlayNow,
}: {
  open: boolean;
  onClose: () => void;
  autoDownloaded?: boolean;
  onPlayNow?: () => void;
}) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showBrowserHint, setShowBrowserHint] = useState(false);
  const [copiedWhich, setCopiedWhich] = useState<'file' | 'page' | null>(null);

  if (!open) return null;

  const baseUrl =
    typeof window !== 'undefined' && window.location.origin.startsWith('http')
      ? `${window.location.origin}${window.location.pathname.replace(/index\.html$/, '')}`
      : '';
  const directFileLink = baseUrl ? `${baseUrl}?dl=1` : './Meziu-Rex-Nekame.html';
  const releasePageLink = baseUrl ? `${baseUrl}?tai=1` : './';

  const handleCopy = async (which: 'file' | 'page', value: string) => {
    const ok = await copyTextFallback(value);
    if (ok) {
      setCopiedWhich(which);
      window.setTimeout(() => {
        setCopiedWhich((prev) => (prev === which ? null : prev));
      }, 2200);
    }
  };

  const handleInstallAppClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowBrowserHint((prev) => !prev);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 pointer-events-auto overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Phát hành & Tải Game Meziu Rex"
        className="relative w-full max-w-md rounded-2xl bg-[#222820] border-2 border-[#8c7e62] p-5 sm:p-6 shadow-[0_24px_60px_rgba(0,0,0,0.75)] text-[#eef1e6] my-auto"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng bảng tải game"
          className="absolute top-3.5 right-3.5 w-9 h-9 rounded-xl bg-[#1a1f18] border border-[#5b6251] text-[#b9c2ab] hover:text-[#e5c158] hover:border-[#e5c158] flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Publisher Release Header */}
        <div className="flex items-center gap-4 pr-8">
          <MeziuChompBadge size={68} className="shrink-0 drop-shadow-[0_6px_14px_rgba(0,0,0,0.6)]" />
          <div className="flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.16em] font-bold text-[#e5c158]">
              Phát hành chính thức · Nekame
            </span>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-[#f3eccd] leading-tight">
              Meziu Rex
            </h2>
            <p className="text-xs sm:text-sm text-[#a8b39a] mt-0.5">
              Bản nhẹ ~3.8 MB · Điện thoại &amp; PC · Chơi Offline
            </p>
          </div>
        </div>

        {autoDownloaded && (
          <div
            role="status"
            className="mt-4 rounded-xl bg-[#1b2919] border border-[#6ea45b] px-3.5 py-2.5 text-xs text-[#cde8be] font-medium"
          >
            Đang tự động tải tệp <strong>Meziu-Rex-Nekame.html</strong> về máy. Nếu trình duyệt hỏi xác nhận hoặc chưa tải, hãy bấm nút màu vàng bên dưới.
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3">
          {/* Primary: Direct 1-file Portable Download for Players (Phone & PC) */}
          <a
            href="./Meziu-Rex-Nekame.html"
            download="Meziu-Rex-Nekame.html"
            className="flex items-center gap-3.5 w-full rounded-xl bg-[#e5c158] hover:bg-[#f0d06e] active:scale-[0.99] text-[#181d16] px-4 py-3.5 shadow-[0_5px_0_#9b7d2b] transition-transform"
          >
            <div className="w-10 h-10 rounded-lg bg-[#181d16]/15 flex items-center justify-center shrink-0">
              <FileDown className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="flex flex-col text-left">
              <span className="font-display font-extrabold text-base leading-tight">
                Tải File Game về máy (ĐT &amp; PC)
              </span>
              <span className="text-xs font-semibold text-[#2d2713]/85 mt-0.5">
                Meziu-Rex-Nekame.html · Bấm mở là chơi ngay, không cần mạng
              </span>
            </div>
          </a>

          {/* Shareable Player Release Links (Direct File Link & Web Release Link) */}
          {baseUrl && (
            <div className="rounded-xl bg-[#1a2018] border border-[#525c47] p-3.5 flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#e5c158]">
                <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Gửi Link tải cho người chơi</span>
              </div>

              {/* Direct File Download Link */}
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 rounded-lg bg-[#131712] border border-[#3e4635] px-2.5 py-2">
                  <div className="text-[10px] text-[#9aa58e] font-semibold">Link tải thẳng File Game:</div>
                  <div className="text-xs font-mono-tabular text-[#e7eadf] truncate select-all">
                    {directFileLink}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy('file', directFileLink)}
                  aria-label="Sao chép link tải file game"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#2c3528] hover:bg-[#3a4634] border border-[#727c62] text-xs font-bold text-[#f3eccd] transition-colors"
                >
                  {copiedWhich === 'file' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#86efac]" aria-hidden="true" />
                      <span className="text-[#86efac]">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#e5c158]" aria-hidden="true" />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>
              </div>

              {/* Release Landing Link */}
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 rounded-lg bg-[#131712] border border-[#3e4635] px-2.5 py-2">
                  <div className="text-[10px] text-[#9aa58e] font-semibold">Link trang tải &amp; chơi online:</div>
                  <div className="text-xs font-mono-tabular text-[#e7eadf] truncate select-all">
                    {releasePageLink}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy('page', releasePageLink)}
                  aria-label="Sao chép link trang phát hành"
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#2c3528] hover:bg-[#3a4634] border border-[#727c62] text-xs font-bold text-[#f3eccd] transition-colors"
                >
                  {copiedWhich === 'page' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-[#86efac]" aria-hidden="true" />
                      <span className="text-[#86efac]">Đã chép</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-[#e5c158]" aria-hidden="true" />
                      <span>Sao chép</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Install as Lightweight App onto Home Screen / Desktop */}
          {isInstalled ? (
            <div className="flex items-center gap-3 w-full rounded-xl bg-[#1a2219] border border-[#5f7d4d] px-4 py-3 text-[#b9df9f]">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-[#86efac]" aria-hidden="true" />
              <span className="text-sm font-semibold">Đã cài đặt App lên thiết bị này</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleInstallAppClick()}
                className="flex items-center gap-3.5 w-full rounded-xl bg-[#2e362a] hover:bg-[#394434] border-2 border-[#6d7660] text-[#f3eccd] px-4 py-3 text-left transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-[#1c2119] border border-[#59614e] flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5 text-[#e5c158]" aria-hidden="true" />
                </div>
                <div className="flex flex-col flex-1">
                  <span className="font-display font-bold text-base leading-tight">
                    {isInstallable
                      ? 'Cài App nhẹ lên màn hình ngay'
                      : isIOS
                      ? 'Cài App lên màn hình iPhone / iPad'
                      : 'Cài thành App trên ĐT / Máy tính'}
                  </span>
                  <span className="text-xs text-[#b5beaa] mt-0.5">
                    Tạo biểu tượng Meziu Rex gặm chữ N ngoài màn hình chính
                  </span>
                </div>
              </button>

              {showBrowserHint && !isInstallable && (
                <div className="rounded-xl bg-[#181d16] border border-[#4f5845] p-3.5 text-xs text-[#cfd6c4] leading-relaxed">
                  {isIOS ? (
                    <p>
                      Trên Safari iPhone/iPad: bấm nút <strong className="text-[#e5c158]">Chia sẻ (Share)</strong> → chọn{' '}
                      <strong className="text-[#e5c158]">Thêm vào Màn hình chính</strong>.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <p>
                        Mở game ở tab trình duyệt riêng rồi bấm{' '}
                        <strong className="text-[#e5c158]">Cài đặt (Install)</strong> trên thanh địa chỉ Chrome/Edge hoặc{' '}
                        <strong className="text-[#e5c158]">Thêm vào MH chính</strong> trên điện thoại.
                      </p>
                      <a
                        href="./"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 font-bold text-[#e5c158] hover:underline"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Mở tab riêng để cài App</span>
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {onPlayNow && (
            <button
              type="button"
              onClick={onPlayNow}
              className="mt-1 flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-transparent hover:bg-[#2c3329] text-sm font-bold text-[#e5c158] transition-colors"
            >
              <Play className="w-4 h-4 fill-current" aria-hidden="true" />
              <span>Chơi thử ngay trên trình duyệt</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function PWAInstallButton({
  compact = false,
  externalOpen,
  onExternalOpenChange,
  autoDownloaded = false,
  onPlayNow,
}: {
  compact?: boolean;
  externalOpen?: boolean;
  onExternalOpenChange?: (next: boolean) => void;
  autoDownloaded?: boolean;
  onPlayNow?: () => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const modalOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setModalOpen = onExternalOpenChange ?? setInternalOpen;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          setModalOpen(true);
        }}
        className={`flex items-center justify-center gap-2 rounded-xl border-2 border-[#7e755c] bg-[#232920]/92 hover:bg-[#31382d] text-[#f3eccd] font-display font-bold shadow-[0_5px_0_#151913,0_10px_20px_rgba(0,0,0,0.4)] transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-[#e5c158] ${
          compact ? 'px-3.5 py-2 text-xs sm:text-sm' : 'px-5 py-3 text-base'
        }`}
      >
        <MeziuChompBadge size={compact ? 20 : 24} className="shrink-0" />
        <span>Tải Game &amp; Link</span>
        <Download className="w-4 h-4 text-[#e5c158]" aria-hidden="true" />
      </button>

      <AppDownloadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        autoDownloaded={autoDownloaded}
        onPlayNow={onPlayNow}
      />
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl bg-[#232920]/95 border border-[#e5c158]/60 px-3 py-1.5 text-xs font-medium text-[#f3eccd] shadow-lg pointer-events-none"
    >
      <span className="h-2 w-2 rounded-full bg-[#e5c158] animate-pulse" aria-hidden="true" />
      <span>Chế độ Offline — Đang chạy dữ liệu đã lưu</span>
    </div>
  );
}
