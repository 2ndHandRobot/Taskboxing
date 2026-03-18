// Two-corner expand SVG: bottom-left ↙ and top-right ↗ arrowheads
export default function ExpandIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 11 11" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* top-right corner */}
      <path d="M7 1H10V4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M10 1L6.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      {/* bottom-left corner */}
      <path d="M4 10H1V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M1 10L4.5 6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}
