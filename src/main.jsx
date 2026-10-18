import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LayoutDashboard, Users, BadgeDollarSign, BriefcaseBusiness, FileSignature,
  Landmark, Package, UserRound, WalletCards, Clock3, ShieldCheck, Monitor,
  BarChart3, Settings, Search, Plus, Bell, MessageSquare, CalendarDays,
  Download, ChevronDown, ArrowUpRight, ArrowDownRight, MoreHorizontal,
  CheckCircle2, AlertCircle, Menu, X, CircleDollarSign, ReceiptText, ListTodo,
  Boxes, Building2, ClipboardCheck, TrendingUp, Send, FileText, UserPlus,
  CircleCheck, Sparkles
} from 'lucide-react';
import './styles.css';
import './modules.css';
import ModuleWorkspace from './modules.jsx';
import './experiences.css';
import { PublicSite } from './experiences.jsx';
import UserManagement from './UserManagement.jsx';
import { authApi, sessionStore, workspaceApi } from './api.js';

const nav = [
  ['Dashboard', LayoutDashboard], ['CRM', Users], ['Sales', BadgeDollarSign],
  ['Projects', BriefcaseBusiness], ['Contracts', FileSignature], ['Finance', Landmark],
  ['Inventory', Package], ['HR', UserRound], ['Payroll', WalletCards],
  ['Attendance', Clock3], ['Security', ShieldCheck], ['Assets', Monitor],
  ['Work Orders', ClipboardCheck], ['Production', Boxes], ['Procurement', Building2],
  ['Customer Portal', UserRound], ['Notifications', Bell], ['Platform Admin', ShieldCheck],
  ['Reports', BarChart3], ['Settings', Settings]
];

const navPermissions = {
  CRM: ['customers.view'], Sales: ['quotations.view'], Projects: ['projects.view'], Contracts: ['contracts.view'],
  Finance: ['invoices.view', 'payments.view', 'balances.view'], Inventory: ['inventory.view'], HR: ['employees.view'],
  Payroll: ['payroll.view'], Attendance: ['attendance.view', 'attendance.view_own'], Security: ['security.dashboard.view'],
  Assets: ['assets.view'], 'Work Orders': ['work_orders.view'], Production: ['production.view'],
  Procurement: ['suppliers.view', 'purchase_orders.view'], 'Customer Portal': ['portal.view'], Notifications: ['notifications.view'],
  'Platform Admin': ['platform.organizations.view'], Reports: ['reports.view'],
  Settings: ['settings.manage', 'organization.update', 'users.manage'],
};
const moduleNavigation = {customers:'CRM',leads:'CRM',quotations:'Sales',contracts:'Contracts',projects:'Projects',tasks:'Projects',employees:'HR',suppliers:'Procurement',assets:'Assets','work-orders':'Work Orders','production-jobs':'Production',documents:'Customer Portal'};

const periodData = {
  'This month': { revenue: '$128,540', receipts: '$98,420', outstanding: '$30,120', projects: '24', tasks: '18' },
  'This quarter': { revenue: '$364,280', receipts: '$319,760', outstanding: '$44,520', projects: '67', tasks: '31' },
  'This year': { revenue: '$1,284,900', receipts: '$1,196,300', outstanding: '$88,600', projects: '218', tasks: '46' }
};

function Logo({ compact = false }) {
  return <div className="brand"><span className="logo-mark"><i /></span>{!compact && <span>Operix</span>}</div>;
}

function MetricCard({ label, value, change, positive = true, Icon }) {
  return <article className="metric card">
    <div className="metric-head"><span>{label}</span><span className="metric-icon"><Icon size={17} /></span></div>
    <strong>{value}</strong>
    <div className={positive ? 'trend positive' : 'trend negative'}>
      {positive ? <ArrowUpRight size={13}/> : <ArrowDownRight size={13}/>} {change}
      <span>vs last period</span>
    </div>
  </article>;
}

function RevenueChart() {
  const points = '0,104 28,77 55,82 83,51 111,66 139,29 167,64 194,39 222,80 250,57 278,70 306,44 334,18 362,31 390,0 418,78';
  return <div className="chart-wrap">
    <div className="y-labels"><span>$40k</span><span>$30k</span><span>$20k</span><span>$10k</span><span>$0</span></div>
    <svg className="line-chart" viewBox="0 0 418 108" preserveAspectRatio="none" aria-label="Monthly revenue line chart">
      {[1,27,53,79,105].map(y => <line key={y} x1="0" x2="418" y1={y} y2={y} className="grid-line"/>)}
      <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3157f5" stopOpacity=".22"/><stop offset="1" stopColor="#3157f5" stopOpacity="0"/></linearGradient></defs>
      <polygon points={`${points} 418,108 0,108`} fill="url(#area)" />
      <polyline points={points} fill="none" stroke="#3157f5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <div className="x-labels"><span>May 1</span><span>May 8</span><span>May 15</span><span>May 22</span><span>May 29</span></div>
  </div>;
}

function Donut() {
  return <div className="donut-row"><div className="donut"/><div className="legend">
    <span><i className="blue"/>Website development <b>38%</b></span>
    <span><i className="violet"/>Design & branding <b>24%</b></span>
    <span><i className="green"/>Printing services <b>18%</b></span>
    <span><i className="orange"/>Digital marketing <b>12%</b></span>
    <span><i className="red"/>Other <b>8%</b></span>
  </div></div>;
}

function Panel({ title, action, children, className = '' }) {
  return <section className={`panel card ${className}`}><div className="panel-title"><h2>{title}</h2>{action}</div>{children}</section>;
}

function LiveDashboard({summary,currency='USD'}) {
  const formatValue=metric=>metric.kind==='currency'?new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:0}).format(Number(metric.value)):String(metric.value);
  return <><div className="metrics-grid">{summary.metrics.map(metric=><article className="metric card" key={metric.key}><div className="metric-head"><span>{metric.label}</span><span className="metric-icon"><TrendingUp size={17}/></span></div><strong>{formatValue(metric)}</strong><div className="trend positive"><CheckCircle2 size={13}/> Live <span>from workspace data</span></div></article>)}</div><div className="primary-grid"><Panel title="Recent activity" className="activity-panel"><div className="activity-list">{summary.activity.map(item=><div className="activity" key={item.id}><span className="activity-icon blue"><Clock3 size={15}/></span><div><b>{item.action.replaceAll('.',' ')}</b><span>{item.resource} · {new Date(item.createdAt).toLocaleString()}</span></div></div>)}{summary.activity.length===0&&<div className="empty-state"><Clock3 size={24}/><b>No recent activity</b><span>Your authorized activity will appear here.</span></div>}</div></Panel></div></>;
}

const activities = [
  [CircleDollarSign, 'Payment received from ABC Construction', 'May 31, 2026 · 10:24 AM', 'green'],
  [FileSignature, 'Contract signed by BuildTech LLC', 'May 31, 2026 · 09:15 AM', 'blue'],
  [BriefcaseBusiness, 'New project created: Mobile App', 'May 30, 2026 · 04:45 PM', 'violet'],
  [Send, 'Quotation accepted by John Smith', 'May 30, 2026 · 02:30 PM', 'orange'],
  [Clock3, 'Guard checked in at Main Office', 'May 30, 2026 · 08:02 AM', 'slate']
];

const materials = [
  ['Vinyl Roll 1.52m', 'Printing', '5', 'm', 'Low'], ['UV Ink Cyan', 'Ink', '2', 'L', 'Low'],
  ['Lamination Gloss 1.52m', 'Lamination', '3', 'm', 'Low'], ['DTF Film 60cm', 'DTF', '15', 'm', 'In stock'],
  ['PVC Board 3mm', 'Material', '25', 'pcs', 'In stock']
];

function App() {
  const [session, setSession] = useState(() => sessionStore.get());
  const [authChecked, setAuthChecked] = useState(() => !sessionStore.get());
  const [experience, setExperience] = useState(() =>
    sessionStore.get() && window.location.hash !== '#website' ? 'app' : 'website'
  );
  const [active, setActive] = useState('Dashboard');
  const [period, setPeriod] = useState('This month');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [remoteMatches,setRemoteMatches]=useState([]);
  const [dashboard,setDashboard]=useState({loading:true,data:null,error:''});
  const data = periodData[period];
  const permissions = session?.permissions ?? [];
  const has = (...required) => permissions.includes('*') || required.some(permission => permissions.includes(permission));
  const visibleNav = nav.filter(([label]) => label === 'Dashboard' || has(...(navPermissions[label] ?? [])));
  const searchable = useMemo(() => [...visibleNav.map(n=>n[0]), ...activities.map(a=>a[1]), ...materials.map(m=>m[0])], [permissions.join('|')]);
  const matches = query.trim() ? remoteMatches : [];
  const notify = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2600); };
  const userName = session?.user ? `${session.user.firstName} ${session.user.lastName}` : 'Operix User';
  const initials = session?.user ? `${session.user.firstName?.[0] ?? ''}${session.user.lastName?.[0] ?? ''}`.toUpperCase() : 'OU';
  const roleName = session?.role?.name ?? (has('platform.organizations.view') ? 'Platform Administrator' : has('organization.update') ? 'Owner / Administrator' : 'Team member');
  const workspaceInitials = session?.organization?.name?.split(/\s+/).map(word=>word[0]).join('').slice(0,2).toUpperCase() || 'OP';
  const isEmployeeSelfService = has('attendance.view_own') && !has('attendance.view') && !has('organization.update');

  React.useEffect(() => {
    if (!session) { setAuthChecked(true); return; }
    let active = true;
    authApi.me().then(() => { if (active) setAuthChecked(true); }).catch(() => {
      if (!active) return;
      sessionStore.clear();
      setSession(null);
      setExperience('website');
      setAuthChecked(true);
    });
    return () => { active = false; };
  }, [session]);

  React.useEffect(()=>{if(!session)return;let live=true;setDashboard({loading:true,data:null,error:''});workspaceApi.dashboard().then(data=>{if(live)setDashboard({loading:false,data,error:''})}).catch(error=>{if(live)setDashboard({loading:false,data:null,error:error.message})});return()=>{live=false}},[session?.organization?.id]);
  React.useEffect(()=>{if(!query.trim()||query.trim().length<2){setRemoteMatches([]);return}let live=true;const timer=window.setTimeout(()=>workspaceApi.search(query).then(result=>{if(live)setRemoteMatches(result.data??[])}).catch(()=>{if(live)setRemoteMatches([])}),250);return()=>{live=false;window.clearTimeout(timer)}},[query]);

  React.useEffect(() => {
    if (!visibleNav.some(([label]) => label === active)) setActive('Dashboard');
  }, [active, permissions.join('|')]);

  if (!authChecked) return <div className="app-auth-check"><Logo/><span>Verifying secure session…</span></div>;
  if (!session || experience === 'website') return <PublicSite onEnter={(authenticatedSession)=>{setSession(authenticatedSession || sessionStore.get());window.location.hash='app';setExperience('app')}} />;

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="sidebar-top"><Logo/><button className="close-menu" onClick={()=>setMenuOpen(false)}><X/></button></div>
      <div className="workspace"><span className="company-dot">{workspaceInitials}</span><div><small>Workspace</small><b>{session.organization.name}</b></div><ChevronDown size={15}/></div>
      <nav>{visibleNav.map(([label, Icon]) => <button key={label} className={active===label?'active':''} onClick={()=>{setActive(label);setMenuOpen(false); if(label!=='Dashboard') notify(`${label} module selected`);}}><Icon size={18}/><span>{label}</span>{label==='Tasks'&&<em>4</em>}</button>)}</nav>
      {has('platform.plans.manage')&&<div className="sidebar-upgrade"><Sparkles size={20}/><b>Subscription management</b><span>Manage tenant plans and access.</span><button onClick={()=>setActive('Platform Admin')}>Manage plans</button></div>}
      <div className="side-profile"><div className="avatar">{initials}</div><div><b>{userName}</b><span>{roleName}</span></div><button className="site-switch" title="View public website" onClick={()=>{window.location.hash='website';setExperience('website')}}><MoreHorizontal size={18}/></button></div>
    </aside>
    {menuOpen && <div className="backdrop" onClick={()=>setMenuOpen(false)}/>} 

    <main>
      <header className="topbar">
        <button className="menu-btn" onClick={()=>setMenuOpen(true)}><Menu/></button>
        <div className="mobile-logo"><Logo/></div>
        <div className="global-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search authorized workspace records..." />{matches.length>0&&<div className="search-results">{matches.map(result=><button key={result.id} onClick={()=>{setActive(moduleNavigation[result.module]??active);setQuery('');notify(`Opened ${result.name}`)}}><Search size={14}/><span>{result.name}<small>{result.module}{result.number?` · ${result.number}`:''}</small></span></button>)}</div>}</div>
        <div className="top-actions">{has('customers.create','projects.create','expenses.create','tasks.create')&&<button className="create-btn" onClick={()=>notify('Quick create menu opened')}><Plus size={19}/> <span>Create new</span></button>}<button className="icon-btn" onClick={()=>notify('No new messages')}><MessageSquare size={19}/></button><button className="icon-btn bell" onClick={()=>notify('You have 3 new notifications')}><Bell size={19}/><i/></button><div className="header-user"><div className="avatar">{initials}</div><div><b>{userName}</b><span>{roleName}</span></div></div></div>
      </header>

      <div className="content">
        <div className="page-head"><div><p>Overview</p><h1>{active}</h1><span>Welcome back, {session.user.firstName}. Here’s what requires your attention.</span></div><div className="head-actions"><div className="period-select"><button onClick={()=>setPeriodOpen(!periodOpen)}><CalendarDays size={16}/>{period}<ChevronDown size={14}/></button>{periodOpen&&<div>{Object.keys(periodData).map(p=><button key={p} onClick={()=>{setPeriod(p);setPeriodOpen(false)}}>{p}</button>)}</div>}</div>{has('reports.export')&&<button className="export-btn" onClick={()=>notify('Dashboard report downloaded')}><Download size={16}/> Export</button>}</div></div>

        {active !== 'Dashboard' && active !== 'Settings' && <ModuleWorkspace active={active} notify={notify} />}
        {active === 'Settings' && <UserManagement notify={notify} />}

        {active === 'Dashboard' && dashboard.loading&&<div className="empty-state"><Clock3 size={28}/><b>Loading dashboard</b><span>Calculating your authorized workspace metrics…</span></div>}
        {active === 'Dashboard' && dashboard.error&&<div className="admin-alert">Dashboard unavailable: {dashboard.error}</div>}
        {active === 'Dashboard' && dashboard.data&&<LiveDashboard summary={dashboard.data} currency={session.organization.defaultCurrency??'USD'}/>} 
        {false && <>
        <div className="metrics-grid">
          {has('reports.view_financial','invoices.view')&&<MetricCard label="Total revenue" value={data.revenue} change="18.4%" Icon={TrendingUp}/>} 
          {has('receipts.view')&&<MetricCard label="Receipts" value={data.receipts} change="15.2%" Icon={ReceiptText}/>} 
          {has('balances.view')&&<MetricCard label="Outstanding" value={data.outstanding} change="5.6%" positive={false} Icon={CircleDollarSign}/>} 
          {has('projects.view')&&<MetricCard label="Active projects" value={data.projects} change="14.3%" Icon={BriefcaseBusiness}/>} 
          {!isEmployeeSelfService&&<MetricCard label="Tasks due" value={data.tasks} change="8.2%" positive={false} Icon={ListTodo}/>} 
          {isEmployeeSelfService&&<>
            <MetricCard label="My tasks due" value="4" change="2 due today" positive={false} Icon={ListTodo}/>
            <MetricCard label="Attendance this month" value="96%" change="On schedule" Icon={Clock3}/>
            <MetricCard label="Next shift" value="8:00 AM" change="Tomorrow" Icon={CalendarDays}/>
            <MetricCard label="Leave balance" value="12 days" change="Available" Icon={UserRound}/>
          </>}
        </div>

        <div className="primary-grid">
          {has('reports.view_financial')&&<Panel title="Revenue overview" action={<button className="text-action">View report <ArrowUpRight size={14}/></button>} className="revenue-panel"><RevenueChart/></Panel>}
          {has('reports.view','services.view')&&<Panel title="Top services" action={<button className="dots"><MoreHorizontal/></button>}><Donut/></Panel>}
          {!isEmployeeSelfService&&<Panel title="Recent activity" action={<button className="text-action">View all</button>} className="activity-panel"><div className="activity-list">{activities.map(([Icon,title,time,color])=><div className="activity" key={title}><span className={`activity-icon ${color}`}><Icon size={15}/></span><div><b>{title}</b><span>{time}</span></div></div>)}</div></Panel>}
          {isEmployeeSelfService&&<>
            <Panel title="My assigned work" action={<button className="text-action" onClick={()=>notify('Showing your assigned tasks')}>View all</button>} className="activity-panel"><div className="activity-list">{[[ListTodo,'Review homepage content','Due today · High priority','orange'],[ClipboardCheck,'Update project progress notes','Due tomorrow','blue'],[FileText,'Submit installation completion report','Due Aug 20','violet'],[Clock3,'Confirm next week availability','Due Aug 22','slate']].map(([Icon,title,time,color])=><div className="activity" key={title}><span className={`activity-icon ${color}`}><Icon size={15}/></span><div><b>{title}</b><span>{time}</span></div></div>)}</div></Panel>
            <Panel title="Attendance & schedule" action={<button className="text-action" onClick={()=>setActive('Attendance')}>Open attendance</button>}><div className="employee-self-service"><div><span>Today</span><strong>Not checked in</strong><small>Scheduled: 8:00 AM – 5:00 PM</small></div><button onClick={()=>setActive('Attendance')}><Clock3 size={16}/> Check in</button><div><span>This month</span><strong>21 days present</strong><small>1 late arrival · 0 absences</small></div></div></Panel>
            <Panel title="My requests" action={<button className="text-action" onClick={()=>notify('Request center opened')}>View requests</button>}><div className="stock-list"><div><span>Annual leave · 2 days</span><b>Pending</b></div><div><span>Travel expense · $48</span><b>Submitted</b></div><div><span>Equipment request</span><b>Approved</b></div></div></Panel>
          </>}
        </div>

        <div className={`secondary-grid ${has('invoices.view')?'can-view-invoices':''}`}>
          <Panel title="Invoices" action={<button className="text-action">View all</button>}><div className="invoice-summary"><div><span>Total invoices</span><strong>32</strong><small><i className="up">20</i> paid · <i>6</i> partial · <i className="down">6</i> unpaid</small></div><div className="mini-donut"/></div></Panel>
          {has('inventory.view')&&<Panel title="Low stock items" action={<button className="text-action">View inventory</button>}><div className="stock-list">{materials.slice(0,3).map(m=><div key={m[0]}><span>{m[0]} </span><b>{m[2]} {m[3]}</b></div>)}</div><div className="restock"><AlertCircle size={15}/> 3 items need restocking</div></Panel>}
          {has('attendance.view')&&<Panel title="Employee attendance" action={<button className="dots"><MoreHorizontal/></button>}><div className="attendance"><div className="gauge"><div><b>84%</b><span>Present</span></div></div><div className="att-legend"><span><i className="green"/>Present <b>42</b></span><span><i className="orange"/>Absent <b>6</b></span><span><i className="red"/>Late <b>2</b></span></div></div><div className="attendance-foot"><span>Total employees</span><b>50</b></div></Panel>}
          {has('balances.view')&&<Panel title="Overdue invoices" action={<button className="text-action">View all</button>}><div className="overdue"><span>8</span><small>Total overdue</small><strong>$18,760.00</strong><div><i/></div><p>Oldest invoice is 18 days overdue</p></div></Panel>}
        </div>

        <div className="bottom-grid">
          {has('projects.view')&&<Panel title="Active projects" action={<button className="text-action">View all projects</button>}><div className="project-list">{[['Website Development','ABC Construction',75],['Brand Identity','Luma Studio',48],['Mobile App Development','BuildTech LLC',32],['Office Signage','Northstar Co.',88]].map(([n,c,p])=><div className="project" key={n}><span className="project-badge">{n.slice(0,2).toUpperCase()}</span><div><b>{n}</b><span>{c}</span><div className="progress"><i style={{width:`${p}%`}}/></div></div><strong>{p}%</strong></div>)}</div></Panel>}
          {has('inventory.view')&&<Panel title="Inventory overview" action={<button className="text-action">View inventory</button>} className="inventory-table"><div className="inventory-stats"><div><span>Stock value</span><b>$48,750</b></div><div><span>Total items</span><b>156</b></div><div><span>Low stock</span><b className="warn">12</b></div></div><table><thead><tr><th>Item</th><th>Category</th><th>Stock</th><th>Status</th></tr></thead><tbody>{materials.map(m=><tr key={m[0]}><td>{m[0]}</td><td>{m[1]}</td><td>{m[2]} {m[3]}</td><td><span className={m[4]==='Low'?'status-low':'status-ok'}>{m[4]}</span></td></tr>)}</tbody></table></Panel>}
          {has('payroll.view')&&<Panel title="Payroll summary" action={<button className="text-action">View report</button>}><div className="payroll-head"><span>Total payroll</span><strong>$56,780.00</strong><small>45 of 50 employees paid</small></div><div className="departments">{[['Design',12500,54],['Development',18750,82],['Marketing',6250,38],['Production',8900,62],['Administration',5300,32]].map(([n,v,p])=><div key={n}><span>{n}</span><i><b style={{width:`${p}%`}}/></i><strong>${v.toLocaleString()}</strong></div>)}</div></Panel>}
        </div>
        </>}
      </div>
    </main>
    {toast && <div className="toast"><CircleCheck size={18}/>{toast}</div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
