// Touch. One question, answered in one place: is a FINGER driving this session, and what
// did it just do? Every other UI module branches on RB.touch.coarse — none of them sniffs
// a user agent, and none of them asks the question a second way.
//
// The phone is not a small desktop. Three things the board relies on simply do not exist
// there and each one is answered here:
//
//   1. THERE IS NO HOVER. js/ui.js's preview flyout is bound to mouseenter, and on iOS a
//      tap FIRES mouseenter before the click — so on a phone the hover preview is not
//      merely absent, it is a flyout that opens on every tap and hangs over the board
//      until the next one. The mouse listeners are not bound at all on a coarse pointer;
//      a long press opens the full-size card instead.
//   2. THERE IS NO TOOLTIP. `title` is what the board uses to say why a card cannot be
//      played. A finger never sees it, so that sentence rides into the inspector.
//   3. A BOARD CARD IS 48px WIDE. Its printed text is unreadable at that size at any font
//      size worth rendering. Press and hold is the read, and it is the same gesture
//      everywhere — hand, board, battlefield, log, pile, deck list.
(function (RB) {
  'use strict';

  const T = RB.touch = RB.touch || {};

  // matchMedia answers for the PRIMARY pointer, which is the right question: a laptop
  // with a touchscreen still has a mouse and must keep its hover flyout. A real touch
  // event is the second and stronger answer, for the device that lies.
  T.coarse = window.matchMedia('(pointer: coarse)').matches;

  const HOLD = 340;   // ms before a touch becomes a read
  const SLOP = 12;    // px of drift before it is a scroll and not a press at all

  // A press that fires is followed by a click the browser sends anyway, and that click
  // would land on whatever is under the finger — playing the card the player only wanted
  // to read. One capturing listener eats exactly one click.
  //
  // It disarms itself on a timer as well: a press whose finger leaves the element never
  // produces the click, and a trap left armed would silently swallow the NEXT real tap.
  T.swallowNextClick = function () {
    const eat = ev => { ev.stopPropagation(); ev.preventDefault(); };
    document.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', eat, { capture: true }), 700);
  };

  // Press and hold `el` to run `fn`. Safe to bind on an element that is ALSO a tap target:
  // the press cancels on the first 12px of drift (so a hand that scrolls horizontally
  // still scrolls) and on pointerup before the timer (so a tap is still a tap).
  T.longPress = function (el, fn) {
    let timer = null, sx = 0, sy = 0;
    const cancel = () => { clearTimeout(timer); timer = null; };
    el.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'mouse') return;      // a mouse has hover; it does not need this
      sx = ev.clientX; sy = ev.clientY;
      cancel();
      timer = setTimeout(() => { timer = null; T.swallowNextClick(); fn(); }, HOLD);
    }, { passive: true });
    el.addEventListener('pointermove', ev => {
      if (timer && (Math.abs(ev.clientX - sx) > SLOP || Math.abs(ev.clientY - sy) > SLOP)) cancel();
    }, { passive: true });
    el.addEventListener('pointerup', cancel, { passive: true });
    el.addEventListener('pointercancel', cancel, { passive: true });
    // iOS raises its OWN callout — copy / share / save image — on a long press over an
    // image, and a card is nothing but an image. css/mobile.css refuses it with
    // -webkit-touch-callout; this refuses the context-menu path that reaches it anyway.
    el.addEventListener('contextmenu', ev => ev.preventDefault());
  };

  // The read. One card at the size the printed text is meant to be read at, plus the one
  // sentence the desktop puts in a tooltip. It is a modal because a phone has nowhere to
  // put a flyout: 21rem of card does not fit beside a 402px board.
  RB.inspect = function (card, note) {
    const box = document.getElementById('inspect');
    box.innerHTML = '';
    const panel = RB.el('inspect-panel');
    panel.appendChild(RB.renderCard(card, { size: 'preview' }));
    if (note) {
      const n = RB.el('inspect-note');
      n.textContent = note;
      panel.appendChild(n);
    }
    const close = RB.el('btn primary inspect-close', 'button');
    close.type = 'button';
    close.textContent = 'Close';
    panel.appendChild(close);
    box.appendChild(panel);
    box.classList.remove('hidden');
    RB.audio.play('ui.click');
  };

  RB.closeInspect = function () {
    document.getElementById('inspect').classList.add('hidden');
  };

  RB.initTouch = function () {
    // A device that reports a fine pointer and is then touched is a device with a finger
    // on it. Every card element is rebuilt on the next RB.paintBoard, so the switch takes
    // effect on the first repaint after the first touch.
    window.addEventListener('touchstart', () => { T.coarse = true; }, { once: true, passive: true });
    // The whole overlay dismisses, not just the button: the gesture that opened it was a
    // press anywhere, so the gesture that closes it is a tap anywhere.
    document.getElementById('inspect').addEventListener('click', RB.closeInspect);
    // The rotate notice is advice, not a lock. A player who wants to play sideways may,
    // and css/mobile.css keeps the board coherent for them — it is simply not the shape
    // this board was drawn for, and saying so once is cheaper than a landscape they have
    // to discover is cramped.
    document.getElementById('rotate').addEventListener('click', function () {
      this.classList.add('dismissed');
    });
  };
})(window.RB = window.RB || {});
