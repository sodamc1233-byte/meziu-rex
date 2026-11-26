import { useId } from 'react';

interface MeziuChompBadgeProps {
  size?: number;
  className?: string;
}

/**
 * Custom publisher/app emblem: Meziu Rex chomping onto the golden Nekame "N" logo.
 */
export function MeziuChompBadge({ size = 36, className = '' }: MeziuChompBadgeProps) {
  const uid = useId().replace(/:/g, '');
  const bgId = `nkm-bg-${uid}`;
  const goldId = `nkm-gold-${uid}`;
  const skinId = `nkm-skin-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id={bgId} cx="45%" cy="40%" r="70%">
          <stop offset="0%" stopColor="#364230" />
          <stop offset="65%" stopColor="#22291f" />
          <stop offset="100%" stopColor="#141912" />
        </radialGradient>
        <linearGradient id={goldId} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor="#fae28c" />
          <stop offset="50%" stopColor="#e5c158" />
          <stop offset="100%" stopColor="#ae8122" />
        </linearGradient>
        <linearGradient id={skinId} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#708057" />
          <stop offset="100%" stopColor="#515f3d" />
        </linearGradient>
      </defs>

      <rect width="512" height="512" rx="108" fill={`url(#${bgId})`} />
      <rect x="20" y="20" width="472" height="472" rx="92" stroke="#d4b457" strokeWidth="12" strokeOpacity="0.88" />

      <ellipse cx="268" cy="412" rx="168" ry="24" fill="#0d110c" fillOpacity="0.58" />

      {/* Mouth cavity */}
      <path d="M178 164 L274 156 L268 232 L182 228 Z" fill="#3f2122" stroke="#181d16" strokeWidth="10" strokeLinejoin="round" />

      {/* Golden N */}
      <g transform="translate(328 266) rotate(-5) translate(-328 -266)">
        <path
          d="M222 396 V132 H276 L372 288 V132 H424 V396 H370 L274 240 V396 Z"
          fill={`url(#${goldId})`}
          stroke="#181d16"
          strokeWidth="14"
          strokeLinejoin="round"
        />
      </g>

      {/* Tail & Body */}
      <path d="M126 306 C84 310 56 276 58 232 C66 266 94 276 130 270 Z" fill={`url(#${skinId})`} stroke="#181d16" strokeWidth="11" strokeLinejoin="round" />
      <path d="M176 346 L176 404 L208 404 C214 404 214 390 202 388 L198 346" fill="#4a5637" stroke="#181d16" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M116 244 C106 310 118 370 168 376 C214 380 230 330 222 246" fill={`url(#${skinId})`} stroke="#181d16" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M170 268 C198 272 210 318 198 358 C184 366 164 362 156 346 C150 322 154 278 170 268 Z" fill="#8fa075" />
      <path d="M132 342 L132 406 L172 406 C178 406 178 390 164 388 L160 342" fill={`url(#${skinId})`} stroke="#181d16" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />

      {/* Lower Jaw + Teeth */}
      <path d="M178 214 C202 222 246 218 272 204 C272 232 244 252 198 250 C174 248 162 232 164 216 Z" fill={`url(#${skinId})`} stroke="#181d16" strokeWidth="11" strokeLinejoin="round" />
      <polygon points="218,214 227,194 236,213" fill="#f5f3e7" stroke="#181d16" strokeWidth="5" strokeLinejoin="round" />
      <polygon points="242,210 252,190 260,207" fill="#f5f3e7" stroke="#181d16" strokeWidth="5" strokeLinejoin="round" />

      {/* Upper Head + Teeth */}
      <path
        d="M114 236 C100 174 114 106 178 96 C234 88 278 114 282 154 C284 174 268 182 244 182 C214 182 184 184 166 226 C152 248 122 256 114 236 Z"
        fill={`url(#${skinId})`}
        stroke="#181d16"
        strokeWidth="12"
        strokeLinejoin="round"
      />
      <polygon points="208,181 217,204 227,181" fill="#f5f3e7" stroke="#181d16" strokeWidth="5" strokeLinejoin="round" />
      <polygon points="234,180 244,203 253,179" fill="#f5f3e7" stroke="#181d16" strokeWidth="5" strokeLinejoin="round" />
      <polygon points="258,176 268,198 276,174" fill="#f5f3e7" stroke="#181d16" strokeWidth="5" strokeLinejoin="round" />

      {/* Eyes */}
      <ellipse cx="182" cy="144" rx="22" ry="25" fill="#f5f6ee" stroke="#181d16" strokeWidth="8" />
      <circle cx="189" cy="145" r="9" fill="#181d16" />
      <circle cx="192" cy="141" r="3" fill="#ffffff" />

      <ellipse cx="229" cy="133" rx="15" ry="17" fill="#f5f6ee" stroke="#181d16" strokeWidth="7" />
      <circle cx="233" cy="134" r="6.5" fill="#181d16" />
      <circle cx="235" cy="131" r="2.2" fill="#ffffff" />

      {/* Tiny arm grabbing N */}
      <path d="M196 292 C216 292 232 288 242 296 C246 302 242 312 232 312 C220 312 206 310 194 312" fill="#708057" stroke="#181d16" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />

      {/* Bite sparks */}
      <path d="M292 114 L306 96" stroke="#fde047" strokeWidth="8" strokeLinecap="round" />
      <path d="M308 134 L328 124" stroke="#fde047" strokeWidth="8" strokeLinecap="round" />
    </svg>
  );
}

interface NekameLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showPublisherText?: boolean;
}

export function NekameLogo({ size = 'md', showPublisherText = true }: NekameLogoProps) {
  const iconDim = size === 'sm' ? 28 : size === 'lg' ? 46 : 36;
  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <MeziuChompBadge size={iconDim} className="shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)]" />
      {showPublisherText && (
        <div className="flex flex-col leading-none">
          <span className="text-[10px] tracking-[0.18em] uppercase text-[#a8b39a] font-medium">
            Phát hành bởi
          </span>
          <span className="font-display text-sm md:text-base font-extrabold tracking-[0.12em] text-[#e7d28b]">
            NEKAME
          </span>
        </div>
      )}
    </div>
  );
}
