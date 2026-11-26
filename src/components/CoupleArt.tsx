/** Eigene Chibi-Illustration: koreanisches Liebespaar, Hand in Hand, mit Herzen und Kirschblüten. */
const SKIN = '#ffe4d6'
const SKIN_SHADE = '#f8cbb8'
const HAIR_G = '#3b2433'
const HAIR_B = '#231a2b'
const BLUSH = '#fb7185'

function Heart({ x, y, s = 1, fill = '#ec4899', className }: { x: number; y: number; s?: number; fill?: string; className?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path className={className} d="M0,-4 C0,-10 9,-10 9,-3 C9,-10 18,-10 18,-4 C18,3 9,8 9,11 C9,8 0,3 0,-4 Z" fill={fill} transform="translate(-9 0)" />
    </g>
  )
}

function Petal({ x, y, r = 0, s = 1 }: { x: number; y: number; r?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} className="klove-petal">
      <path d="M0,0 C4,-6 10,-6 10,0 C10,5 4,8 0,10 C-4,8 -10,5 -10,0 C-10,-6 -4,-6 0,0 Z" fill="#fbcfe8" stroke="#f9a8d4" strokeWidth="0.8" />
    </g>
  )
}

export default function CoupleArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 290" className={className} role="img" aria-label="Ein verliebtes Chibi-Pärchen hält Händchen unter Herzen und Kirschblüten">
      <defs>
        <radialGradient id="kl-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#fbcfe8" stopOpacity="0.9" />
          <stop offset="1" stopColor="#fbcfe8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="kl-dress" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f9a8d4" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <linearGradient id="kl-shirt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4b5fd" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>

      {/* Hintergrund-Leuchten */}
      <circle cx="200" cy="150" r="140" fill="url(#kl-glow)" />

      {/* Kirschblüten */}
      <Petal x={60} y={60} r={20} />
      <Petal x={340} y={80} r={-30} s={0.9} />
      <Petal x={90} y={200} r={60} s={0.7} />
      <Petal x={320} y={210} r={10} s={0.8} />
      <Petal x={300} y={30} r={45} s={0.6} />
      <Petal x={40} y={140} r={-15} s={0.6} />

      {/* Schatten */}
      <ellipse cx="200" cy="268" rx="115" ry="9" fill="#be185d" opacity="0.15" />

      {/* ===== Sie ===== */}
      {/* langes Haar hinten */}
      <path d="M100,122 C96,66 204,66 200,122 L208,214 C192,226 108,226 92,214 Z" fill={HAIR_G} />
      {/* Beine & Schuhe */}
      <rect x="134" y="236" width="9" height="22" rx="4" fill={SKIN} />
      <rect x="157" y="236" width="9" height="22" rx="4" fill={SKIN} />
      <ellipse cx="138" cy="260" rx="8" ry="5" fill="#be185d" />
      <ellipse cx="162" cy="260" rx="8" ry="5" fill="#be185d" />
      {/* Kleid */}
      <path d="M128,166 L172,166 L194,242 C170,250 130,250 106,242 Z" fill="url(#kl-dress)" />
      <path d="M136,166 L150,180 L164,166 Z" fill="#fff" />
      <circle cx="150" cy="190" r="3" fill="#fff" opacity="0.8" />
      {/* linker Arm (winkt leicht) */}
      <path d="M130,176 C116,190 112,204 116,214" stroke={SKIN} strokeWidth="10" strokeLinecap="round" fill="none" />
      {/* Kopf */}
      <circle cx="150" cy="122" r="46" fill={SKIN} />
      <ellipse cx="150" cy="164" rx="10" ry="4" fill={SKIN_SHADE} />
      {/* Pony */}
      <path d="M103,120 C106,74 194,74 197,120 C186,104 172,96 160,108 C152,94 132,96 124,110 C118,103 108,108 103,120 Z" fill={HAIR_G} />
      {/* Haarspange */}
      <Heart x={184} y={92} s={0.7} fill="#f472b6" />
      {/* glückliche, geschlossene Augen */}
      <path d="M127,130 q8,-9 16,0" stroke={HAIR_G} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M157,130 q8,-9 16,0" stroke={HAIR_G} strokeWidth="3.2" strokeLinecap="round" fill="none" />
      <path d="M126,128 l-4,-3 M174,128 l4,-3" stroke={HAIR_G} strokeWidth="2" strokeLinecap="round" />
      {/* Bäckchen & Mund */}
      <ellipse cx="128" cy="143" rx="8" ry="4.5" fill={BLUSH} opacity="0.45" />
      <ellipse cx="172" cy="143" rx="8" ry="4.5" fill={BLUSH} opacity="0.45" />
      <path d="M145,146 q5,5 10,0" stroke="#be123c" strokeWidth="2.2" strokeLinecap="round" fill="none" />

      {/* ===== Er ===== */}
      {/* Beine & Schuhe */}
      <rect x="232" y="236" width="10" height="22" rx="4" fill="#475569" />
      <rect x="258" y="236" width="10" height="22" rx="4" fill="#475569" />
      <ellipse cx="236" cy="260" rx="9" ry="5" fill="#1f2937" />
      <ellipse cx="264" cy="260" rx="9" ry="5" fill="#1f2937" />
      {/* Oberteil */}
      <path d="M226,164 L274,164 L286,240 L214,240 Z" fill="url(#kl-shirt)" />
      <path d="M238,164 L250,178 L262,164 Z" fill="#fff" />
      <line x1="250" y1="180" x2="250" y2="236" stroke="#7c3aed" strokeWidth="1.5" opacity="0.5" />
      {/* rechter Arm, Hand in der Tasche */}
      <path d="M272,174 C284,190 286,204 280,214" stroke="url(#kl-shirt)" strokeWidth="11" strokeLinecap="round" fill="none" />
      {/* Kopf */}
      <circle cx="250" cy="116" r="48" fill={SKIN} />
      <ellipse cx="250" cy="160" rx="10" ry="4" fill={SKIN_SHADE} />
      {/* Haar */}
      <path
        d="M201,114 C198,60 302,60 299,114 C293,100 284,93 276,98 C270,86 254,84 246,95 C236,86 219,91 213,104 C209,102 204,107 201,114 Z"
        fill={HAIR_B}
      />
      <path d="M201,114 C199,124 203,132 206,134 L208,112 Z M299,114 C301,124 297,132 294,134 L292,112 Z" fill={HAIR_B} />
      <path d="M248,66 q4,-14 16,-10" stroke={HAIR_B} strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* Augen – schaut verliebt zu ihr */}
      <ellipse cx="233" cy="122" rx="5.5" ry="7" fill={HAIR_B} />
      <ellipse cx="265" cy="122" rx="5.5" ry="7" fill={HAIR_B} />
      <circle cx="231" cy="119" r="2.2" fill="#fff" />
      <circle cx="263" cy="119" r="2.2" fill="#fff" />
      <circle cx="235" cy="125" r="1" fill="#fff" />
      <circle cx="267" cy="125" r="1" fill="#fff" />
      {/* Bäckchen & Lächeln */}
      <ellipse cx="226" cy="138" rx="8" ry="4.5" fill={BLUSH} opacity="0.4" />
      <ellipse cx="273" cy="138" rx="8" ry="4.5" fill={BLUSH} opacity="0.4" />
      <path d="M243,140 q7,6 13,0" stroke="#9f1239" strokeWidth="2.2" strokeLinecap="round" fill="none" />

      {/* ===== Händchen halten ===== */}
      <path d="M170,176 C182,190 190,200 198,206" stroke={SKIN} strokeWidth="10" strokeLinecap="round" fill="none" />
      <path d="M228,174 C216,190 208,200 202,206" stroke="url(#kl-shirt)" strokeWidth="11" strokeLinecap="round" fill="none" />
      <circle cx="200" cy="207" r="8" fill={SKIN} />

      {/* aufsteigende Herzen */}
      <g className="klove-float" style={{ animationDelay: '0s' }}>
        <Heart x={200} y={180} s={1.2} />
      </g>
      <g className="klove-float" style={{ animationDelay: '1.3s' }}>
        <Heart x={188} y={175} s={0.7} fill="#f472b6" />
      </g>
      <g className="klove-float" style={{ animationDelay: '2.6s' }}>
        <Heart x={213} y={178} s={0.8} fill="#fb7185" />
      </g>
      <Heart x={200} y={48} s={1.6} className="klove-beat" />
      <Heart x={110} y={56} s={0.8} fill="#f9a8d4" />
      <Heart x={296} y={52} s={0.9} fill="#f9a8d4" />

      {/* 사랑해 = „Ich liebe dich“ */}
      <text x="200" y="285" textAnchor="middle" fontSize="15" fontWeight="700" fill="#db2777" style={{ fontFamily: 'var(--font-display)' }}>
        사랑해 ♥
      </text>
    </svg>
  )
}
