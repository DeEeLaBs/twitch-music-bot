import type React from 'react';
import { ListPlus } from 'lucide-react';
import { popText, type QueuePopItem } from '../overlayQueuePop.ts';
import type { OverlayPopAnimation, OverlayPopPosition, OverlayPopStyle } from '../overlayOptions.ts';

export interface QueuePopDesign {
  animation: OverlayPopAnimation;
  position: OverlayPopPosition;
  style: OverlayPopStyle;
  showArt: boolean;
}

/** The short "song added to the queue" card. It lives inside the overlay widget, so it follows the widget wherever it sits. */
export const QueuePopCard: React.FC<{ item: QueuePopItem; language: 'de' | 'en'; seconds: number; design: QueuePopDesign }> = ({ item, language, seconds, design }) => {
  const text = popText(item, language);
  const art = item.kind === 'track' ? item.art : '';
  const className = `overlay-queue-pop pop-pos-${design.position} pop-anim-${design.animation} pop-style-${design.style}${design.showArt ? '' : ' queue-pop-no-art'}`;
  return (
    <div className={className} role="status" style={{ ['--pop-duration' as string]: `${seconds}s` } as React.CSSProperties}>
      {design.showArt && (art
        ? <img className="queue-pop-art" src={art} alt="" onError={event => { event.currentTarget.style.display = 'none'; }} />
        : <span className="queue-pop-art queue-pop-art-fallback" aria-hidden="true"><ListPlus /></span>)}
      <span className="queue-pop-copy">
        <span className="queue-pop-kicker">{text.kicker}</span>
        <strong title={text.title}>{text.title}</strong>
        {text.subtitle && <span className="queue-pop-sub">{text.subtitle}</span>}
      </span>
    </div>
  );
};
