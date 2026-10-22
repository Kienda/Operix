import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  ShieldCheck,
  BarChart3,
  Boxes,
  Users,
  BriefcaseBusiness,
  Menu,
  X,
  Globe2,
  LockKeyhole,
  Smartphone,
  Zap,
} from 'lucide-react';
import OperixMotionExperience, { motionTokens } from '../operix-motion.jsx';
import ProductJourney from '../product-journey.jsx';
import { motion, useReducedMotion } from 'motion/react';

function Brand() {
  return (
    <div className="public-brand">
      <span className="public-logo">
        <i />
      </span>
      <b>Operix</b>
    </div>
  );
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Counts a number up from zero once, timed to land with the hero entrance sequence.
function CountUp({ to, delay = 0, duration = 1400, format = (v) => Math.round(v) }) {
  const [value, setValue] = useState(() => (reducedMotion() ? to : 0));
  useEffect(() => {
    if (reducedMotion()) return;
    let frame, start;
    const tick = (t) => {
      start ??= t + delay;
      const p = Math.min(Math.max((t - start) / duration, 0), 1);
      setValue(to * (1 - Math.pow(1 - p, 4)));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [to, delay, duration]);
  return format(value);
}

const chartLine =
  'M0 112 L35 92 L70 98 L105 54 L140 78 L175 30 L210 69 L245 48 L280 72 L320 32 L355 43 L400 8';
const money = (v, d = 0) =>
  v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

function HeroVisual() {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  // Pointer-driven parallax tilt; CSS reads the custom properties.
  const move = (e) => {
    if (reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -6}deg`);
    ref.current.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 8 - 4}deg`);
  };
  const leave = () => {
    ref.current.style.removeProperty('--rx');
    ref.current.style.removeProperty('--ry');
  };
  const metrics = [
    ['Revenue', 128.5, (v) => `$${money(v, 1)}k`],
    ['Projects', 24],
    ['Employees', 50],
  ];
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : motionTokens.story, ease: motionTokens.ease }}
      className="hero-visual"
      ref={ref}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      <div className="visual-top">
        <Brand />
        <span>Owner dashboard</span>
      </div>
      <div className="visual-metrics">
        {metrics.map(([label, to, format], i) => (
          <div key={label} style={{ '--i': i }}>
            <span>{label}</span>
            <b>
              <CountUp to={to} format={format} delay={700 + i * 120} />
            </b>
            <small>↗ 18.4%</small>
          </div>
        ))}
      </div>
      <div className="visual-chart">
        <span>Revenue overview</span>
        <svg viewBox="0 0 400 130">
          <defs>
            <linearGradient id="pubarea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5272ff" stopOpacity=".35" />
              <stop offset="1" stopColor="#5272ff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path className="chart-area" d={`${chartLine} L400 130 L0 130Z`} fill="url(#pubarea)" />
          <path
            className="chart-line"
            d={chartLine}
            pathLength="1"
            fill="none"
            stroke="#6582ff"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <circle className="chart-pulse" cx="400" cy="8" r="5" />
          <circle className="chart-dot" cx="400" cy="8" r="4.5" />
        </svg>
      </div>
      <div className="floating-card">
        <span>Payment received</span>
        <b>
          $<CountUp to={12450} delay={1700} duration={1100} format={(v) => money(v, 2)} />
        </b>
        <small>
          <Check /> Verified successfully
        </small>
      </div>
    </motion.div>
  );
}

import '../experiences.css';

// Existing marketing layout, shared without the prototype authentication or dashboard.
export default function Landing({ onLogin }) {
  const [mobile, setMobile] = useState(false);
  return (
    <div className="public-site">
      <header>
        <Brand />
        <nav className={mobile ? 'open' : ''}>
          {['Features', 'Tour', 'Modules', 'Industries', 'Pricing', 'Security'].map((x) => (
            <a href={`#${x.toLowerCase()}`} onClick={() => setMobile(false)} key={x}>
              {x}
            </a>
          ))}
          <a className="nav-login" href="/login" onClick={onLogin}>
            Login
          </a>
          <button
            className="nav-demo"
            onClick={() =>
              document.querySelector('#contact').scrollIntoView({ behavior: 'smooth' })
            }
          >
            Request a demo
          </button>
        </nav>
        <button
          className="public-menu"
          aria-label="Toggle navigation"
          aria-expanded={mobile}
          onClick={() => setMobile(!mobile)}
        >
          {mobile ? <X /> : <Menu />}
        </button>
      </header>
      <main>
        <section className="public-hero">
          <div className="hero-copy">
            <div className="hero-pill">
              <span>New</span> One platform for your entire business <ArrowRight size={13} />
            </div>
            <h1>
              Manage everything.
              <br />
              <em>Grow everywhere.</em>
            </h1>
            <p>
              Connect customers, projects, finance, inventory, people, and field operations in one
              secure business platform.
            </p>
            <div className="hero-actions">
              <button onClick={onLogin}>
                Login <ArrowRight size={16} />
              </button>
              <button
                onClick={() =>
                  document.querySelector('#modules').scrollIntoView({ behavior: 'smooth' })
                }
              >
                Explore modules
              </button>
            </div>
            <div className="hero-proof">
              <span>
                <Check />
                Invitation-only accounts
              </span>
              <span>
                <Check />
                Restricted staging
              </span>
              <span>
                <Check />
                Setup support included
              </span>
            </div>
          </div>
          <HeroVisual />
        </section>
        <section className="trusted">
          <span>Built to power ambitious businesses worldwide</span>
          <div>
            {['NORTHSTAR', 'BUILDTECH', 'LUMA', 'APEX'].map((x) => (
              <b key={x}>{x}</b>
            ))}
          </div>
        </section>
        <section className="public-section" id="features">
          <div className="section-title">
            <span>ONE CONNECTED SYSTEM</span>
            <h2>
              Everything your team needs.
              <br />
              Nothing they don’t.
            </h2>
            <p>Activate only the modules your business needs today. Add more as you grow.</p>
          </div>
          <div className="feature-grid">
            {[
              [
                Users,
                'CRM & Sales',
                'Turn leads into loyal customers with a complete view of every relationship.',
              ],
              [
                BriefcaseBusiness,
                'Projects & Work',
                'Plan, execute, and deliver every job with confidence and control.',
              ],
              [
                BarChart3,
                'Finance & Reports',
                'Know where your money goes with accurate, real-time business insights.',
              ],
              [
                Boxes,
                'Inventory & Production',
                'Track every item, material movement, production job, and supplier.',
              ],
              [
                Smartphone,
                'Field Operations',
                'GPS attendance, patrols, work orders, and offline tools for field teams.',
              ],
              [
                ShieldCheck,
                'Security by design',
                'Tenant isolation, granular permissions, MFA, and complete audit history.',
              ],
            ].map(([Icon, n, d]) => (
              <article key={n}>
                <span>
                  <Icon />
                </span>
                <h3>{n}</h3>
                <p>{d}</p>
                <a>
                  Learn more <ArrowRight size={13} />
                </a>
              </article>
            ))}
          </div>
        </section>
        <ProductJourney onStart={onLogin} />
        <section className="module-band" id="modules">
          <div>
            <span>MODULAR BY DESIGN</span>
            <h2>
              One foundation.
              <br />
              Every operation.
            </h2>
            <p>
              Operix replaces disconnected spreadsheets and software with a shared source of truth.
            </p>
          </div>
          <div className="module-cloud">
            {[
              'CRM',
              'Sales',
              'Contracts',
              'Projects',
              'Finance',
              'Inventory',
              'Production',
              'HR',
              'Payroll',
              'Attendance',
              'Security',
              'Assets',
              'Reports',
              'Customer portal',
            ].map((x, i) => (
              <span className={i === 3 || i === 6 ? 'featured' : ''} key={x}>
                {x}
              </span>
            ))}
          </div>
        </section>
        <section className="public-section security-section" id="security">
          <div className="security-art">
            <ShieldCheck />
            <span>
              <LockKeyhole />
              HTTPS protected
            </span>
            <span>
              <Globe2 />
              Tenant isolation
            </span>
            <span>
              <Zap />
              MFA for privileged roles
            </span>
          </div>
          <div>
            <span>ENTERPRISE SECURITY</span>
            <h2>Your business data stays your business.</h2>
            <p>
              Operix is designed around secure tenant isolation, role-based access, audit logs,
              strong authentication, and reliable backups.
            </p>
            <ul>
              {[
                'Organization-level data isolation',
                'Custom roles and granular permissions',
                'Multi-factor authentication',
                'Immutable audit history',
              ].map((x) => (
                <li key={x}>
                  <Check />
                  {x}
                </li>
              ))}
            </ul>
          </div>
        </section>
        <OperixMotionExperience />
        <section className="cta" id="contact">
          <span>READY TO TAKE CONTROL?</span>
          <h2>Run your entire business from one place.</h2>
          <p>Join teams replacing operational chaos with clarity, accountability, and growth.</p>
          <button onClick={onLogin}>
            Login to Operix <ArrowRight />
          </button>
        </section>
      </main>
      <footer>
        <Brand />
        <p>Business operations, simplified.</p>
        <div>
          <span>© 2026 Operix</span>
          <a>Privacy</a>
          <a>Terms</a>
          <a>Security</a>
        </div>
      </footer>
    </div>
  );
}
