import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, MotionConfig, motion, useInView, useMotionValueEvent, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { ArrowRight, Check, Monitor, Search, MapPin, Radio, Package, BarChart3, Palette, Smartphone, Layers, Target, Users, ShieldCheck } from 'lucide-react';
import './operix-motion.css';

export const motionTokens = { ease: [0.22, 1, 0.36, 1], fast: .25, normal: .55, story: .85 };
function useCompact() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px), (pointer: coarse)').matches);
  useEffect(() => { const media = window.matchMedia('(max-width: 700px), (pointer: coarse)'); const update = () => setCompact(media.matches); media.addEventListener('change', update); return () => media.removeEventListener('change', update); }, []);
  return compact;
}

const advantages = [
  ['CRM & Sales', 'Every relationship, connected.', 'Keep customers, leads and quotations in one shared workspace.', Palette],
  ['Projects & Work', 'A clear next step for every job.', 'Bring projects, tasks and work orders into focus.', Monitor],
  ['Finance', 'Follow the money with clarity.', 'Connect invoices, payment verification and financial records.', Search],
  ['People & Access', 'One team. Clear responsibilities.', 'Organize workspace membership, roles and permissions.', Radio],
  ['Inventory', 'Know what moves, and why.', 'Keep items, stock movements and suppliers connected.', Package],
  ['Business Overview', 'See the work behind the numbers.', 'Review workspace activity and operational summaries.', BarChart3],
];

function Illustration({ kind, visible, reduced, compact }) {
  const part = (i, extra = {}) => ({ initial: false, animate: visible || reduced ? { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 } : { opacity: .12, x: kind === 1 ? (i % 2 ? 14 : -14) : 0, y: kind === 4 ? 12 : 0, rotate: kind === 0 ? -6 : 0, scale: kind === 3 ? .85 : 1 }, transition: { duration: reduced ? 0 : motionTokens.normal, delay: reduced ? 0 : i * (compact ? .035 : .09), ease: motionTokens.ease }, ...extra });
  return <div className={`operix-illustration operix-art-${kind}`} aria-hidden="true">
    {kind === 0 && <><div className="operix-design-grid"/><span className="operix-art-label">One customer record. Every next step.</span><motion.b {...part(0)} className="operix-type"><span>CRM</span></motion.b><div className="operix-swatches">{['Lead','Quote','Customer'].map((stage,i)=><motion.i key={stage} {...part(i+1)}>{stage}</motion.i>)}</div></>}
    {kind === 1 && <><motion.div {...part(0)} className="operix-browser"><i/><i/><i/><div><span/><span/><span/></div></motion.div><motion.div {...part(1)} className="operix-phone"><Smartphone/><span/></motion.div><motion.div {...part(2)} className="operix-component"><Layers size={20}/><span>Tasks connected</span></motion.div></>}
    {kind === 2 && <><motion.div {...part(0)} className="operix-search"><Search size={15}/><span>Invoice → Payment → Verification</span></motion.div><div className="operix-results">{[1,2,3].map((n,i)=><motion.div key={n} {...part(i+1)}><b>{n === 1 ? <Check size={16}/> : `0${n}`}</b><span style={{transform:`scaleX(${1-i*.19})`}}/>{n===1&&<Check size={14}/>}</motion.div>)}</div></>}
    {kind === 3 && <><svg viewBox="0 0 300 150"><g stroke="currentColor" opacity=".3">{[[45,35],[255,35],[40,120],[260,120]].map(([x,y])=><motion.path key={x} d={`M150 78 L${x} ${y}`} initial={false} animate={{pathLength:visible||reduced?1:0}} transition={{duration:reduced?0:.7}}/>)}</g></svg><motion.span {...part(0)} className="operix-signal"><Users/></motion.span>{[[15,15],[78,15],[13,72],[80,72]].map(([x,y],i)=><motion.i {...part(i+1)} className="operix-audience" key={i} style={{left:`${x}%`,top:`${y}%`}}><ShieldCheck size={17}/></motion.i>)}</>}
    {kind === 4 && <><motion.div {...part(0)} className="operix-sign">STOCK<span>ITEMS & MOVEMENTS</span></motion.div><motion.div {...part(1)} className="operix-box"><Package size={30}/></motion.div><motion.div {...part(2)} className="operix-business-card">ITEM<span>Receive · Issue · Track</span></motion.div></>}
    {kind === 5 && <><div className="operix-growth-labels"><span>Activity</span><span>Overview</span></div><svg viewBox="0 0 300 150"><path d="M20 130H280" stroke="currentColor" opacity=".15"/><motion.path d="M25 120L80 105L130 110L180 65L225 75L275 24" fill="none" stroke="currentColor" strokeWidth="3" initial={false} animate={{pathLength:visible||reduced?1:0}} transition={{duration:reduced?0:.85,ease:motionTokens.ease}}/><motion.circle cx="275" cy="24" r="7" fill="#3157f5" {...part(3)}/></svg></>}
  </div>;
}

function Advantage({ item, index, compact, reduced }) {
  const ref = useRef(null); const visible = useInView(ref, { once:true, amount:.35 }); const [title, headline, description, Icon] = item;
  return <motion.article ref={ref} className="operix-advantage" initial={false} whileHover={compact||reduced?undefined:{y:-5,borderColor:'#7894f7'}} transition={{duration:motionTokens.fast}}>
    <Illustration kind={index} visible={visible} reduced={reduced} compact={compact}/><div className="operix-card-copy"><span><Icon size={14}/>{title}</span><h3>{headline}</h3><p>{description}</p></div>
  </motion.article>;
}

const pillars = ['Connect','Organize','Operate','Understand'];
const pillarCopy = ['Bring customers, people and records into one workspace.', 'Give projects, responsibilities and access a clear structure.', 'Move daily work forward across connected business modules.', 'Review activity and summaries to choose your next step.'];
const launch = ['Workspace','Branches','Team members','Roles & permissions','Customers','Projects','Inventory','Financial records'];
const transform = ['Capture the customer','Create the quotation','Link the project','Issue the invoice','Verify the payment','Review the activity'];

function ProgressStory({ type, title, intro, steps, reduced, compact }) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({target:ref,offset:['start center','end center']});
  const smooth = useSpring(scrollYProgress,{stiffness:140,damping:30});
  const [active,setActive] = useState(0);
  useMotionValueEvent(scrollYProgress,'change',value=>setActive(Math.min(steps.length-1,Math.floor(value*steps.length))));
  const drift = useTransform(smooth,[0,1],[10,-10]);
  const [selected,setSelected] = useState(null);
  const current = selected ?? active;
  return <section className={`operix-story operix-${type}`} ref={ref} aria-labelledby={`operix-${type}-title`}>
    <div className="operix-story-heading"><span className="operix-eyebrow">{type==='pillars'?'THE OPERIX WAY':type==='launch'?'YOUR OPERIX WORKSPACE':'A CONNECTED BUSINESS WORKFLOW'}</span><h2 id={`operix-${type}-title`}>{title}</h2><p>{intro}</p><motion.div className="operix-orbit" aria-hidden="true" style={{y:reduced||compact?0:drift}}><span>Operix</span><i/></motion.div></div>
    <div className="operix-story-body"><div className="operix-track" aria-hidden="true"><motion.i style={{scaleY:reduced?1:smooth}}/></div><ol>{steps.map((step,i)=><motion.li key={step} initial={false} animate={{x:type==='launch'&&!reduced&&i>current?(compact?10:20):0,opacity:type==='launch'&&!reduced&&i>current?.5:1}} transition={{duration:reduced?0:motionTokens.normal,ease:motionTokens.ease}} className={reduced||i<=current?'is-reached':''}><button onClick={()=>setSelected(i)} aria-current={i===current?'step':undefined}><span className="operix-step-number">{String(i+1).padStart(2,'0')}</span><span>{step}</span>{i===current&&<ArrowRight size={18}/>}</button>{type==='pillars'&&<p>{pillarCopy[i]}</p>}</motion.li>)}</ol>
      {selected!==null&&<button className="operix-follow-scroll" onClick={()=>setSelected(null)}>Follow scroll <ArrowRight size={14}/></button>}
      <div className="operix-story-caption"><AnimatePresence mode="wait" initial={false}><motion.span key={current} initial={reduced?false:{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:reduced?0:.2}}>{type==='launch'?`${steps[current]} — part of one connected workspace.`:type==='transformation'?`${String(current+1).padStart(2,'0')} / ${steps.length} · ${steps[current]}`:`${steps[current]} with Operix.`}</motion.span></AnimatePresence></div>
    </div>
  </section>;
}

function OperationsPipeline({reduced,compact}) {
  const ref=useRef(null); const visible=useInView(ref,{once:true,amount:.3});
  return <section className="operix-print" ref={ref}><div><span className="operix-eyebrow">DAILY OPERATIONS</span><h2>From incoming work.<br/>To a clear record.</h2><p>Keep handoffs visible as work moves through your business.</p></div><ol className="operix-pipeline">{['Plan','Execute','Review'].map((step,i)=><motion.li key={step} initial={false} animate={{opacity:reduced||visible?1:.25,x:reduced||visible?0:-12}} transition={{duration:reduced?0:.55,delay:reduced?0:i*(compact?.1:.22),ease:motionTokens.ease}}><span>0{i+1}</span><b>{step}</b>{i<2&&<ArrowRight size={18}/>}</motion.li>)}</ol><div className="operix-pills">{['Projects','Tasks','Work orders','Stock movements','Audit history'].map((pill,i)=><motion.span key={pill} initial={false} animate={{opacity:visible||reduced?1:.15,scale:visible||reduced?1:.97}} transition={{duration:reduced?0:.25,delay:reduced?0:i*(compact?.025:.055)}}>{pill}</motion.span>)}</div></section>;
}

export default function OperixMotionExperience() {
  const reduced=useReducedMotion(); const compact=useCompact();
  return <MotionConfig reducedMotion="user" transition={{duration:motionTokens.normal,ease:motionTokens.ease}}><div className="operix-experience" id="operix-advantage"><section className="operix-advantage-section"><div className="operix-section-heading"><span className="operix-eyebrow">THE OPERIX ADVANTAGE</span><h2>One workspace.<br/><em>Every operation.</em></h2><p>Operix brings customers, work, finance, inventory and people into a shared business workspace.</p></div><div className="operix-advantage-grid">{advantages.map((item,index)=><Advantage key={item[0]} {...{item,index,compact,reduced}}/>)}</div></section><ProgressStory type="pillars" title="Your business, working together." intro="Follow the flow from connected records to organized work and a clearer business overview." steps={pillars} {...{reduced,compact}}/><OperationsPipeline {...{reduced,compact}}/><ProgressStory type="launch" title="Give your team a shared foundation." intro="A workspace setup journey: bring your structure, people and business records together." steps={launch} {...{reduced,compact}}/><ProgressStory type="transformation" title="From first conversation to verified payment." intro="See how customer, project and finance records fit into one business journey." steps={transform} {...{reduced,compact}}/></div></MotionConfig>;
}
