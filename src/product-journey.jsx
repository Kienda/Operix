import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowRight, BriefcaseBusiness, Boxes, CalendarCheck, ChevronDown, Infinity as InfinityIcon, LockKeyhole, MapPin, ShieldCheck, Smartphone, Users, Wallet } from 'lucide-react';
import './product-journey.css';

// One scene per stop on the flight. The camera travels down the z-axis through them in order.
const scenes = [
  { intro: true },
  { icon: Users, tag: 'CRM & Sales', title: 'Win the deal before it goes cold.', text: 'Every lead, quote and conversation lives in one pipeline your whole team can see — so no customer ever slips through the cracks.', points: ['Visual sales pipeline', 'Quotes & contracts', 'Full customer history'], mock: 'crm' },
  { icon: BriefcaseBusiness, tag: 'Projects & Work', title: 'Deliver every job on time.', text: 'Plan phases, assign crews and watch progress update live as work gets done in the field.', points: ['Timelines & milestones', 'Task assignments', 'Budget vs. actual'], mock: 'projects' },
  { icon: Wallet, tag: 'Finance & Reports', title: 'Know where every dollar goes.', text: 'Invoices, payments and expenses flow straight from operations into your books and real-time reports.', points: ['Invoicing & payments', 'Expense tracking', 'Live cash-flow reports'], mock: 'finance' },
  { icon: Boxes, tag: 'Inventory & Production', title: 'Never run out. Never overstock.', text: 'Follow every item from supplier to warehouse to job site, with alerts before stock runs low.', points: ['Multi-location stock', 'Low-stock alerts', 'Production jobs'], mock: 'inventory' },
  { icon: MapPin, tag: 'Field Operations', title: 'Your field teams, on the map.', text: 'GPS attendance, patrols and work orders that keep working even when the signal doesn’t.', points: ['GPS-verified clock-in', 'Patrol routes', 'Offline work orders'], mock: 'field' },
  { icon: CalendarCheck, tag: 'HR & Payroll', title: 'Take care of the people doing the work.', text: 'Attendance feeds payroll automatically, so everyone is paid correctly and on time.', points: ['Employee records', 'Attendance → payroll', 'Leave & schedules'], mock: 'people' },
  { icon: ShieldCheck, tag: 'Security', title: 'Locked down by design.', text: 'Every company is isolated, every action is logged, and every user sees only what their role allows.', points: ['Role-based permissions', 'Multi-factor authentication', 'Immutable audit log'], mock: 'security' },
  { finale: true },
];
const LAST = scenes.length - 1;
const MODULES = scenes.filter(s => s.tag).length;
const DEPTH = 1800; // px between scenes along the z-axis

const clamp = (v, lo = 0, hi = 1) => Math.min(Math.max(v, lo), hi);
// Smoothstep inside each segment makes the camera slow down and "dwell" at every scene.
const dwell = t => { const i = Math.min(Math.floor(t), LAST - 1), f = t - i; return i + f * f * (3 - 2 * f); };

function Mock({ type }) {
  const d = s => ({ '--d': `${s}s` });
  if (type === 'crm') return <div className="mock-crm">{[['New', [['Northstar', '$18.2k'], ['Apex Labs', '$7.5k']]], ['Proposal', [['Luma Studio', '$24.0k'], ['BuildTech', '$11.3k']]], ['Won', [['Global HT', '$42.0k']]]].map(([col, cards], c) => <div key={col}><span>{col}</span>{cards.map(([n, v], i) => <p className="pop" style={d(c * .18 + i * .1)} key={n}><b>{n}</b><small>{v}</small></p>)}</div>)}</div>;
  if (type === 'projects') return <div className="mock-gantt">{[['Site survey', 0, 22, '#6582ff'], ['Foundation', 14, 34, '#8b5cf6'], ['Framing', 38, 30, '#19a56a'], ['Electrical', 58, 24, '#f59e0b'], ['Handover', 80, 20, '#6582ff']].map(([n, l, w, c], i) => <div key={n}><span>{n}</span><i><em className="grow" style={{ left: `${l}%`, width: `${w}%`, background: c, ...d(i * .12) }} /></i></div>)}<footer><span>Riverside Tower</span><b className="pop" style={d(.7)}>68% complete</b></footer></div>;
  if (type === 'finance') return <div className="mock-finance"><div className="mock-bars">{[40, 62, 48, 78, 66, 92].map((h, i) => <i className="rise" key={i} style={{ height: `${h}%`, ...d(i * .08) }} />)}</div>{[['INV-1042', 'ABC Construction', '$12,450', 'Paid'], ['INV-1043', 'Luma Studio', '$3,200', 'Sent']].map(([id, c, v, s], i) => <p className="pop" style={d(.5 + i * .12)} key={id}><span>{id}</span><b>{c}</b><span>{v}</span><em className={s.toLowerCase()}>{s}</em></p>)}</div>;
  if (type === 'inventory') return <div className="mock-stock">{[['Steel beams', '420 units', 82], ['Cement bags', '36 units', 14], ['Copper wire', '1,240 m', 64], ['Safety helmets', '88 units', 45]].map(([n, q, lvl], i) => <div className="pop" style={d(i * .1)} key={n}><b>{n}</b><span>{q}</span><i><em className={`grow ${lvl < 20 ? 'low' : ''}`} style={{ width: `${lvl}%`, ...d(.2 + i * .1) }} /></i>{lvl < 20 && <small>Reorder</small>}</div>)}</div>;
  if (type === 'field') return <div className="mock-map"><svg viewBox="0 0 300 170" preserveAspectRatio="none"><path className="route" pathLength="1" d="M30 150 C80 120 70 60 130 70 S210 140 262 38" /></svg>{[[10, 84, 'Crew A'], [43, 38, 'Site 4'], [87, 18, 'Patrol']].map(([x, y, n], i) => <span className="pop" key={n} style={{ left: `${x}%`, top: `${y}%`, ...d(.3 + i * .25) }}><MapPin />{n}</span>)}<p><Smartphone /> 12 workers clocked in · GPS verified</p></div>;
  if (type === 'people') return <div className="mock-people">{[['AK', 'Amina Keita', 'Site lead', 'On site'], ['JM', 'Jonas Meyer', 'Electrician', 'On site'], ['SL', 'Sara Lopez', 'Accountant', 'Remote'], ['DB', 'David Bah', 'Driver', 'On leave']].map(([ini, n, r, s], i) => <div className="pop" style={d(i * .1)} key={n}><i>{ini}</i><b>{n}<small>{r}</small></b><em className={s.replace(' ', '-').toLowerCase()}>{s}</em></div>)}<footer className="pop" style={d(.55)}><span>May payroll · 50 employees</span><b>$84,120 ready</b></footer></div>;
  if (type === 'security') return <div className="mock-audit"><div className="pop" style={d(0)}><ShieldCheck /><b>MFA enforced<small>All 50 accounts protected</small></b></div>{[['Owner', 'Signed in with MFA', '10:24', 'ok'], ['Finance', 'Approved INV-1042', '10:31', 'ok'], ['Field crew', 'Blocked: payroll access', '10:32', 'blocked'], ['Admin', 'Changed role permissions', '10:40', 'ok']].map(([who, what, t, s], i) => <p className={`pop ${s}`} style={d(.15 + i * .1)} key={what}><LockKeyhole /><b>{who}</b><span>{what}</span><small>{t}</small></p>)}</div>;
  return null;
}

export default function ProductJourney({ onStart }) {
  const reduced = useReducedMotion();
  const section = useRef(null), canvas = useRef(null), sceneEls = useRef([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const el = section.current, cv = canvas.current, ctx = cv.getContext('2d');
    const stars = Array.from({ length: 320 }, () => ({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random() }));
    let frame, cam = 0, w = 0, h = 0;
    const resize = () => { const dpr = Math.min(window.devicePixelRatio || 1, 2); w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener('resize', resize);

    const loop = () => {
      frame = requestAnimationFrame(loop);
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const p = clamp(-r.top / (r.height - innerHeight));
      el.style.setProperty('--p', p);
      // Ease the camera toward its target so scroll jumps still glide.
      const prev = cam;
      cam += (dwell(p * LAST) - cam) * .09;
      const velocity = Math.abs(cam - prev);

      sceneEls.current.forEach((s, i) => {
        if (!s) return;
        const dist = i - cam, side = i % 2 ? 1 : -1;
        const opacity = dist >= 0 ? clamp(1 - (dist - .1) / 1.1) : clamp(1 + dist / .3);
        s.style.opacity = opacity;
        s.style.visibility = opacity > 0 ? 'visible' : 'hidden';
        s.style.transform = `translate(-50%,-50%) translate3d(${side * dist * 380}px,${dist * -60}px,${-dist * DEPTH}px) rotateY(${side * dist * -16}deg)`;
      });
      const idx = Math.round(cam);
      setActive(a => a === idx ? a : idx);

      // Warp-speed starfield: streak length follows camera velocity.
      const speed = .0025 + velocity * .5;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, spread = Math.max(w, h) * .55;
      for (const s of stars) {
        const z0 = s.z;
        s.z -= speed;
        if (s.z <= .02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; continue; }
        const x = cx + s.x / s.z * spread, y = cy + s.y / s.z * spread;
        const tx = cx + s.x / Math.min(z0 + speed * 6, 1) * spread, ty = cy + s.y / Math.min(z0 + speed * 6, 1) * spread;
        const a = clamp(1 - s.z) * .9;
        ctx.strokeStyle = `rgba(${170 + 60 * (1 - s.z) | 0},${190 + 50 * (1 - s.z) | 0},255,${a})`;
        ctx.lineWidth = (1 - s.z) * 2.2 + .3;
        ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      }
    };
    frame = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', resize); };
  }, [reduced]);

  const go = i => {
    const el = section.current, top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top + (el.offsetHeight - innerHeight) * i / LAST, behavior: 'smooth' });
  };

  let moduleNo = 0;
  return <section className={`journey${reduced ? ' static' : ''}`} id="tour" ref={section} style={{ '--n': scenes.length }}>
    <div className="journey-stage">
      {!reduced && <canvas className="journey-stars" ref={canvas} aria-hidden="true" />}
      <div className="journey-world">
        {scenes.map((s, i) => {
          const on = reduced || active === i;
          const cls = `journey-scene${s.intro ? ' intro' : ''}${s.finale ? ' finale' : ''}${on ? ' on' : ''}`;
          const ref = n => (sceneEls.current[i] = n);
          if (s.intro) return <div className={cls} ref={ref} key={i}>
            <span className="reveal journey-eyebrow" style={{ '--d': '0s' }}>THE OPERIX JOURNEY</span>
            <h2 className="reveal" style={{ '--d': '.1s' }}>Travel through your<br /><em>entire business.</em></h2>
            <p className="reveal" style={{ '--d': '.2s' }}>From the first lead to the last payslip — scroll to fly through every module and see how it all connects.</p>
            {!reduced && <button className="reveal journey-hint" style={{ '--d': '.3s' }} onClick={() => go(1)}>Start the journey <ChevronDown /></button>}
          </div>;
          if (s.finale) return <div className={cls} ref={ref} key={i}>
            <svg className="journey-infinity" viewBox="0 0 200 100" aria-hidden="true"><defs><linearGradient id="infgrad" x1="0" x2="1"><stop offset="0" stopColor="#6582ff" /><stop offset=".5" stopColor="#a78bfa" /><stop offset="1" stopColor="#38bdf8" /></linearGradient></defs><path className="inf-base" pathLength="1" d="M100 50 C100 18 155 18 155 50 C155 82 100 82 100 50 C100 18 45 18 45 50 C45 82 100 82 100 50Z" /><path className="inf-spark" pathLength="1" d="M100 50 C100 18 155 18 155 50 C155 82 100 82 100 50 C100 18 45 18 45 50 C45 82 100 82 100 50Z" /></svg>
            <span className="reveal journey-eyebrow" style={{ '--d': '.4s' }}>{MODULES} MODULES · ONE PLATFORM</span>
            <h2 className="reveal" style={{ '--d': '.5s' }}>Everything connected.<br /><em>Growth without limits.</em></h2>
            <p className="reveal" style={{ '--d': '.6s' }}>Start with the modules you need today and switch on the rest as you grow — your data follows you all the way.</p>
            <button className="reveal journey-cta" style={{ '--d': '.7s' }} onClick={onStart}>Start your free trial <ArrowRight /></button>
          </div>;
          moduleNo += 1;
          const Icon = s.icon;
          return <div className={cls} ref={ref} key={i}>
            <div className="journey-copy">
              <span className="reveal journey-count" style={{ '--d': '0s' }}>{String(moduleNo).padStart(2, '0')} / {String(MODULES).padStart(2, '0')}</span>
              <span className="reveal journey-tag" style={{ '--d': '.06s' }}><Icon />{s.tag}</span>
              <h3 className="reveal" style={{ '--d': '.12s' }}>{s.title}</h3>
              <p className="reveal" style={{ '--d': '.2s' }}>{s.text}</p>
              <ul>{s.points.map((pt, k) => <li className="reveal" style={{ '--d': `${.28 + k * .07}s` }} key={pt}>{pt}</li>)}</ul>
            </div>
            <div className="journey-window"><header><i /><i /><i /><span>operix.app / {s.tag.split(' ')[0].toLowerCase()}</span></header><Mock type={s.mock} /></div>
          </div>;
        })}
      </div>
      {!reduced && <>
        <nav className="journey-rail" aria-label="Product tour">{scenes.map((s, i) => s.tag && <button className={active === i ? 'on' : ''} onClick={() => go(i)} key={i}><i /><span>{s.tag}</span></button>)}</nav>
        <div className="journey-progress"><i /></div>
        <InfinityIcon className="journey-mark" aria-hidden="true" />
      </>}
    </div>
  </section>;
}
