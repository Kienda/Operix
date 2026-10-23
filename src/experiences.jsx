import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { authApi, sessionStore } from './api.js';
import Landing from './public/Landing.jsx';
function Brand(){return <div className="public-brand"><span className="public-logo"><i/></span><b>Operix</b></div>}
export function PublicSite({onEnter}) {
  const [auth,setAuth]=useState(false);
  const inviteToken=new URLSearchParams(location.search).get('invite');
  if(inviteToken)return <InviteScreen token={inviteToken}/>;
  if(auth)return <AuthScreen onBack={()=>setAuth(false)} onEnter={onEnter}/>;
  return <Landing onLogin={e=>{e?.preventDefault();setAuth(true)}}/>;
}

function AuthScreen({onBack,onEnter}){
  const [show,setShow]=useState(false); const [loading,setLoading]=useState(false); const [error,setError]=useState('');
  // The API resolves the workspace from the account itself; a slug is only needed
  // when the same login belongs to more than one active workspace.
  const [workspaces,setWorkspaces]=useState([]); const [workspace,setWorkspace]=useState('');
  const [email,setEmail]=useState(import.meta.env.DEV?'owner@demo.operix.local':'');
  const [password,setPassword]=useState(import.meta.env.DEV?'OperixDemo!2026':'');
  const submit=async e=>{
    e.preventDefault();setLoading(true);setError('');
    try{
      const result=await authApi.login({email:email.trim().toLowerCase(),password,...(workspace?{organizationSlug:workspace}:{})});
      sessionStore.set(result);onEnter(result);
    }catch(err){
      const choices=err.details?.workspaces;
      if(choices?.length){setWorkspaces(choices);setWorkspace(choices[0].slug);setError('Choose the workspace you want to sign in to.')}
      else setError(err.message);
      setLoading(false);
    }
  };
  return <div className="auth-page"><aside><button onClick={onBack}>← Back to website</button><Brand/><div><span>OPERATIONS, SIMPLIFIED.</span><h1>One secure home for your entire business.</h1><p>Customers. Contracts. Projects. People. Finance. All connected and always under control.</p></div><footer>© 2026 Operix</footer></aside><main><form onSubmit={submit}><div className="auth-mobile-brand"><Brand/></div><span>WELCOME BACK</span><h2>Sign in to Operix</h2><p>Enter your work credentials to continue.</p><label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<div><input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} required/><button type="button" onClick={()=>setShow(!show)}>{show?<EyeOff/>:<Eye/>}</button></div></label>{workspaces.length>0&&<label>Workspace<select value={workspace} onChange={e=>setWorkspace(e.target.value)}>{workspaces.map(w=><option key={w.slug} value={w.slug}>{w.name}</option>)}</select></label>}{error&&<div className="auth-error">{error}</div>}<div className="auth-options"><label><input type="checkbox" defaultChecked/> Remember me</label><button type="button">Forgot password?</button></div><button className="sign-in" disabled={loading}>{loading?'Signing in…':'Sign in securely'}{!loading&&<ArrowRight/>}</button><div className="auth-divider"><i/>or continue with<i/></div><div className="sso"><button type="button">G <span>Google</span></button><button type="button">M <span>Microsoft</span></button></div><small className="auth-security"><ShieldCheck/>Protected by enterprise-grade security and MFA</small></form></main></div>
}

function InviteScreen({token}){
  const [loading,setLoading]=useState(false),[message,setMessage]=useState(''),[done,setDone]=useState(false);
  const submit=async e=>{e.preventDefault();setLoading(true);setMessage('');const f=new FormData(e.currentTarget);try{await authApi.acceptInvitation({token,firstName:f.get('firstName'),lastName:f.get('lastName'),password:f.get('password')});setDone(true);setMessage('Your account is ready. You can now sign in with the invited email.')}catch(err){setMessage(err.message)}finally{setLoading(false)}};
  return <div className="auth-page"><aside><Brand/><div><span>WELCOME TO OPERIX</span><h1>Your company has invited you to collaborate.</h1><p>Your assigned role controls the modules and company records you can access.</p></div></aside><main>{done?<div className="invite-complete"><ShieldCheck/><h2>Account created</h2><p>{message}</p><button className="sign-in" onClick={()=>{history.replaceState({},'',location.pathname+'#website');location.reload()}}>Continue to sign in <ArrowRight/></button></div>:<form onSubmit={submit}><div className="auth-mobile-brand"><Brand/></div><span>SECURE INVITATION</span><h2>Create your account</h2><p>Complete your profile and choose a password of at least 12 characters.</p><div className="form-row"><label>First name<input name="firstName" required/></label><label>Last name<input name="lastName" required/></label></div><label>Password<input name="password" type="password" minLength="12" required/></label>{message&&<div className="auth-error">{message}</div>}<button className="sign-in" disabled={loading}>{loading?'Creating account…':'Accept invitation'}<ArrowRight/></button></form>}</main></div>;
}
